import { asRecord, stringField } from "./json.ts";
import { isWithin } from "./settings.ts";

/** What the last sync left for one note, to tell a remote change from a local one. */
export interface SyncedNote {
	readonly path: string;
	/** The note's head when last synced. */
	readonly head: string;
	/** The note's text at that head: a file that differs was edited here, and a merge starts from it. */
	readonly base: string;
}

/** Keyed by note at-uri. */
export type WikiState = Readonly<Record<string, SyncedNote>>;

/** Keyed by wiki at-uri. */
export type SyncState = Readonly<Record<string, WikiState>>;

/** The state with the note synced at `from` moved to `to`, when both are in one folder. */
export function renameSyncedPath(
	state: WikiState,
	from: string,
	to: string,
): WikiState {
	// A file moved out of the wiki's folder is no longer a note, so it reads as missing.
	if (
		from.slice(0, from.lastIndexOf("/")) !== to.slice(0, to.lastIndexOf("/"))
	) {
		return state;
	}
	const entry = Object.entries(state).find(([, note]) => note.path === from);
	if (!entry) return state;
	const [uri, note] = entry;
	return { ...state, [uri]: { ...note, path: to } };
}

/** The state with every note synced at or under `from` moved to `to`. */
export function moveSyncedFolder(
	state: WikiState,
	from: string,
	to: string,
): WikiState {
	const moved: Record<string, SyncedNote> = {};
	for (const [uri, note] of Object.entries(state)) {
		moved[uri] = isWithin(note.path, from)
			? { ...note, path: to + note.path.slice(from.length) }
			: note;
	}
	return moved;
}

// An entry missing a field cannot be trusted to guard a local edit, so it is dropped.
export function parseSyncState(data: unknown): SyncState {
	const wikis: Record<string, WikiState> = {};
	for (const [wiki, notes] of Object.entries(asRecord(data))) {
		const parsed: Record<string, SyncedNote> = {};
		for (const [note, entry] of Object.entries(asRecord(notes))) {
			const raw = asRecord(entry);
			const path = stringField(raw, "path");
			const head = stringField(raw, "head");
			if (path && head && typeof raw["base"] === "string") {
				parsed[note] = { path, head, base: raw["base"] };
			}
		}
		wikis[wiki] = parsed;
	}
	return wikis;
}
