import type { Client } from "@atcute/client";
import type { Did, ResourceUri } from "@atcute/lexicons/syntax";
import * as TID from "@atcute/tid";
import {
	type CheckProblem,
	checkNewNoteTitle,
	checkRevision,
} from "@lichen/client/check";
import { createDiff } from "@lichen/client/diff";
import { applyCreates, putRecord } from "@lichen/client/pds-write";
import {
	newNoteWrites,
	type RecordWrite,
	revisionWrite,
	snapshotWrite,
} from "@lichen/client/writes";
import { canWrite, getNote, isSlugTaken } from "./appview.ts";
import { titleFromPath } from "./filenames.ts";
import type { SyncedNote, WikiState } from "./sync-state.ts";
import type { Vault } from "./vault.ts";

type HeadOutcome = "accepted" | "lost" | "timeout";

interface WaitOptions {
	readonly attempts?: number;
	readonly intervalMs?: number;
	readonly sleep?: (ms: number) => Promise<void>;
}

/** Polls until the appview names `revision` the head; `parent` is null for a new note. */
async function waitForHead(
	appview: Client,
	uri: ResourceUri,
	revision: string,
	parent: string | null,
	{
		attempts = 15,
		intervalMs = 1000,
		sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	}: WaitOptions = {},
): Promise<HeadOutcome> {
	for (let attempt = 0; attempt < attempts; attempt++) {
		if (attempt > 0) await sleep(intervalMs);
		const head = (await getNote(appview, uri))?.latestRevisionUri ?? null;
		if (head === revision) return "accepted";
		// Another revision took the parent; one built on ours within the wait reads the same.
		if (head !== parent) return "lost";
	}
	return "timeout";
}

export interface PushReport {
	readonly pushed: readonly string[];
	readonly created: readonly string[];
	/** Their note moved since the last sync: a pull merges them first. */
	readonly behind: readonly string[];
	/** Their revision lost the head to another; a pull merges them. */
	readonly lost: readonly string[];
	/** The appview had not taken their revision as head when the wait ended. */
	readonly pending: readonly string[];
	/** New files whose title mints a slug the wiki already holds. */
	readonly taken: readonly string[];
	/** Ingest would drop them. */
	readonly refused: readonly { path: string; problem: CheckProblem }[];
	/** New paths of synced files renamed while the plugin was not watching. */
	readonly moved: readonly string[];
	/** Synced files no longer at their path, renamed or deleted. */
	readonly missing: readonly string[];
	/** New files left as they are while a synced file is missing, since one may be it renamed. */
	readonly heldBack: readonly string[];
}

interface PushRun {
	readonly appview: Client;
	readonly pds: Client;
	readonly author: Did;
	readonly wiki: ResourceUri;
	readonly wait: WaitOptions | undefined;
	readonly state: Record<string, SyncedNote>;
	readonly report: { [K in keyof PushReport]: PushReport[K][number][] };
}

/**
 * Edited files become revisions on their notes' heads, and markdown files new
 * in `folder` become notes titled by their filename.
 */
export async function pushWiki(
	appview: Client,
	pds: Client,
	author: Did,
	vault: Vault,
	wiki: ResourceUri,
	folder: string,
	known: WikiState,
	wait?: WaitOptions,
): Promise<{ state: WikiState; report: PushReport }> {
	if (!(await canWrite(appview, wiki, author))) {
		throw new Error(`${author} cannot edit ${wiki}`);
	}
	const run: PushRun = {
		appview,
		pds,
		author,
		wiki,
		wait,
		state: { ...known },
		report: {
			pushed: [],
			created: [],
			behind: [],
			lost: [],
			pending: [],
			taken: [],
			refused: [],
			moved: [],
			missing: [],
			heldBack: [],
		},
	};

	const missing = new Map<ResourceUri, SyncedNote>();
	for (const [uri, synced] of Object.entries(known) as [
		ResourceUri,
		SyncedNote,
	][]) {
		const content = await vault.read(synced.path);
		if (content === null) missing.set(uri, synced);
		else if (content !== synced.base) {
			await pushEdit(run, uri, synced, content);
		}
	}

	const syncedPaths = new Set(Object.values(known).map((note) => note.path));
	const newFiles = new Map<string, string>();
	for (const path of await vault.list(folder)) {
		if (syncedPaths.has(path)) continue;
		const content = await vault.read(path);
		if (content !== null) newFiles.set(path, content);
	}

	for (const [uri, path] of matchMoves(missing, newFiles)) {
		const synced = missing.get(uri) as SyncedNote;
		run.state[uri] = { ...synced, path };
		run.report.moved.push(path);
		missing.delete(uri);
		newFiles.delete(path);
	}
	run.report.missing.push(...[...missing.values()].map((note) => note.path));

	for (const [path, content] of newFiles) {
		if (missing.size > 0) run.report.heldBack.push(path);
		else await createNote(run, path, content);
	}
	return { state: run.state, report: run.report };
}

// Only text that one missing note and one new file share pairs them: anything
// looser could bind a file to the wrong note.
function matchMoves(
	missing: ReadonlyMap<ResourceUri, SyncedNote>,
	newFiles: ReadonlyMap<string, string>,
): [ResourceUri, string][] {
	const count = (texts: Iterable<string>) => {
		const counts = new Map<string, number>();
		for (const text of texts) counts.set(text, (counts.get(text) ?? 0) + 1);
		return counts;
	};
	const missingTexts = count([...missing.values()].map((note) => note.base));
	const newTexts = count(newFiles.values());
	const unique = (text: string) =>
		missingTexts.get(text) === 1 && newTexts.get(text) === 1;

	return [...missing].flatMap(([uri, note]) => {
		if (!unique(note.base)) return [];
		const path = [...newFiles].find(([, text]) => text === note.base)?.[0];
		return path === undefined ? [] : [[uri, path] as [ResourceUri, string]];
	});
}

async function pushEdit(
	run: PushRun,
	uri: ResourceUri,
	synced: SyncedNote,
	content: string,
): Promise<void> {
	// Attachments come later, so a revision lists no blobs yet.
	const problem = checkRevision(content, undefined, []);
	if (problem) {
		run.report.refused.push({ path: synced.path, problem });
		return;
	}
	const current = await getNote(run.appview, uri);
	if (current === null) return;
	if (current.latestRevisionUri !== synced.head) {
		run.report.behind.push(synced.path);
		return;
	}

	const createdAt = new Date().toISOString();
	const revision = revisionWrite(run.author, TID.now(), {
		noteRef: uri,
		parentRevision: current.latestRevisionUri,
		diff: createDiff(current.content, content),
		createdAt,
	});
	await putRecord(run.pds, revision);
	const snapshot = snapshotWrite(run.author, {
		noteRef: uri,
		wikiRef: run.wiki,
		slug: current.slug,
		title: current.title,
		content,
		atRevision: revision.uri,
		createdAt,
	});
	await settle(run, {
		kind: "pushed",
		uri,
		path: synced.path,
		content,
		revision,
		parent: current.latestRevisionUri,
		snapshot,
	});
}

async function createNote(
	run: PushRun,
	path: string,
	content: string,
): Promise<void> {
	const title = titleFromPath(path);
	const titleCheck = checkNewNoteTitle(title);
	if ("problem" in titleCheck) {
		run.report.refused.push({ path, problem: titleCheck.problem });
		return;
	}
	const problem = checkRevision(content, undefined, []);
	if (problem) {
		run.report.refused.push({ path, problem });
		return;
	}
	if (await isSlugTaken(run.appview, run.wiki, titleCheck.slug)) {
		run.report.taken.push(path);
		return;
	}

	const writes = newNoteWrites(run.author, {
		wikiRef: run.wiki,
		slug: titleCheck.slug,
		title,
		content,
		createdAt: new Date().toISOString(),
	});
	await applyCreates(run.pds, [writes.note, writes.revision]);
	await settle(run, {
		kind: "created",
		uri: writes.note.uri,
		path,
		content,
		revision: writes.revision,
		parent: null,
		snapshot: writes.snapshot,
	});
}

interface Written {
	readonly kind: "pushed" | "created";
	readonly uri: ResourceUri;
	readonly path: string;
	readonly content: string;
	readonly revision: RecordWrite;
	readonly parent: string | null;
	readonly snapshot: RecordWrite;
}

async function settle(run: PushRun, written: Written): Promise<void> {
	const { uri, path, revision } = written;
	const outcome = await waitForHead(
		run.appview,
		uri,
		revision.uri,
		written.parent,
		run.wait,
	);
	if (outcome !== "accepted") {
		run.report[outcome === "lost" ? "lost" : "pending"].push(path);
		return;
	}
	run.state[uri] = { path, head: revision.uri, base: written.content };
	run.report[written.kind].push(path);
	await writeSnapshot(run.pds, written.snapshot);
}

// A snapshot only helps a later rebuild, so failing to write one fails nothing.
async function writeSnapshot(
	pds: Client,
	snapshot: RecordWrite,
): Promise<void> {
	try {
		await putRecord(pds, snapshot);
	} catch (err) {
		console.warn(`[lichen-sync] snapshot ${snapshot.uri} not written`, err);
	}
}
