import type { Client } from "@atcute/client";
import type { ResourceUri } from "@atcute/lexicons/syntax";
import { getNote, listNotes } from "./appview.ts";
import { claimPath, conflictCopyPath, usedStems } from "./filenames.ts";
import { mergeText } from "./merge.ts";
import type { SyncedNote, WikiState } from "./sync-state.ts";
import { readNote, type Vault } from "./vault.ts";

export interface PullReport {
	readonly written: readonly string[];
	/** Edited here and took the remote changes too, so they still need a push. */
	readonly merged: readonly string[];
	/** Copies of local edits that overlapped a remote change. */
	readonly conflictCopies: readonly string[];
	/** Copies of files found at a note's name with no sync state to merge from. */
	readonly recoveredCopies: readonly string[];
	/** Files of notes deleted on lichen.wiki, removed here. */
	readonly deleted: readonly string[];
	/** Copies of local edits to notes deleted on lichen.wiki, their files removed. */
	readonly deletedCopies: readonly string[];
	/** Synced notes the wiki no longer lists, their files left as they are. */
	readonly gone: readonly string[];
}

export async function pullWiki(
	appview: Client,
	vault: Vault,
	wiki: ResourceUri,
	folder: string,
	known: WikiState,
): Promise<{ state: WikiState; report: PullReport }> {
	const state: Record<string, SyncedNote> = { ...known };
	const report = {
		written: [] as string[],
		merged: [] as string[],
		conflictCopies: [] as string[],
		recoveredCopies: [] as string[],
		deleted: [] as string[],
		deletedCopies: [] as string[],
	};
	const listed = new Set<string>();
	const used = usedStems(Object.values(known).map((note) => note.path));

	for await (const view of listNotes(appview, wiki)) {
		listed.add(view.uri);
		const synced = known[view.uri];
		if (view.status === "deleted") {
			if (synced) await removeDeleted(vault, folder, synced, report);
			delete state[view.uri];
			continue;
		}
		if (synced?.head === view.latestRevisionUri) continue;

		const note = await getNote(appview, view.uri);
		if (note === null) continue;

		const path = synced ? synced.path : claimPath(folder, note, used);
		const local = await readNote(vault, path);

		if (local === note.content) {
			// Already the head: a lost sync state, or the same edit made on both sides.
		} else if (local === null || local === synced?.base) {
			await vault.write(path, note.content);
			report.written.push(path);
		} else if (!synced) {
			// Likely this note's file from a lost sync state, at an unknown revision: nothing to merge from.
			report.recoveredCopies.push(
				await writeConflictCopy(vault, folder, path, local),
			);
			await vault.write(path, note.content);
		} else {
			const merged = mergeText(synced.base, local, note.content);
			if (merged === null) {
				report.conflictCopies.push(
					await writeConflictCopy(vault, folder, path, local),
				);
				await vault.write(path, note.content);
			} else if (merged !== local) {
				await vault.write(path, merged);
				report.merged.push(path);
			}
		}
		// getNote's head, not the listing's: the note may have moved in between.
		state[view.uri] = {
			path,
			head: note.latestRevisionUri,
			base: note.content,
		};
	}

	const gone = Object.entries(known)
		.filter(([uri]) => !listed.has(uri))
		.map(([, note]) => note.path);
	return { state, report: { ...report, gone } };
}

// lichen.wiki keeps a deleted note's history, so only a local edit needs keeping here.
async function removeDeleted(
	vault: Vault,
	folder: string,
	synced: SyncedNote,
	report: { deleted: string[]; deletedCopies: string[] },
): Promise<void> {
	const local = await readNote(vault, synced.path);
	if (local === null) return;
	if (local !== synced.base) {
		report.deletedCopies.push(
			await writeConflictCopy(vault, folder, synced.path, local),
		);
	} else {
		report.deleted.push(synced.path);
	}
	await vault.remove(synced.path);
}

async function writeConflictCopy(
	vault: Vault,
	folder: string,
	path: string,
	content: string,
): Promise<string> {
	for (let n = 1; ; n++) {
		const copy = conflictCopyPath(folder, path, n);
		if ((await vault.read(copy)) === null) {
			await vault.write(copy, content);
			return copy;
		}
	}
}
