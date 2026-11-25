import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ResourceUri } from "@atcute/lexicons/syntax";
import { parseSyncState, type WikiState } from "@lichen-wiki/sync/sync-state";
import { readJsonFile, writeJsonFile } from "./json-file.ts";

const VERSION = 1;
const STATE = join(".lichen", "state.json");

/** A folder's wiki, and the sync package's state for it. */
export interface FolderLink {
	readonly wiki: ResourceUri;
	readonly notes: WikiState;
}

/** The linked folder at or above `cwd`, as git finds its repository. */
export async function findLinkedFolder(
	cwd: string,
): Promise<{ root: string; link: FolderLink } | null> {
	for (let dir = cwd; ; dir = dirname(dir)) {
		const link = await readFolderLink(dir);
		if (link) return { root: dir, link };
		if (dirname(dir) === dir) return null;
	}
}

// Unreadable state throws rather than reading as unlinked: the state is what tells a local edit from a remote one.
async function readFolderLink(root: string): Promise<FolderLink | null> {
	const path = join(root, STATE);
	let raw: Record<string, unknown> | null;
	try {
		raw = await readJsonFile(path);
	} catch (err) {
		if (!(err instanceof SyntaxError)) throw err;
		raw = {};
	}
	if (!raw) return null;
	const wiki = raw["wiki"];
	if (raw["version"] !== VERSION || typeof wiki !== "string") {
		throw new Error(`${path} is unreadable by this version of lichen.`);
	}
	const notes = parseSyncState({ [wiki]: raw["notes"] })[wiki] ?? {};
	return { wiki: wiki as ResourceUri, notes };
}

export async function writeFolderLink(
	root: string,
	link: FolderLink,
): Promise<void> {
	const path = join(root, STATE);
	await mkdir(dirname(path), { recursive: true });
	await writeJsonFile(path, { version: VERSION, ...link });
}
