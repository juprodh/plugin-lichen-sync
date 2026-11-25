import { isWithin } from "./folders.ts";
import type { SyncedNote, WikiState } from "./sync-state.ts";
import type { Vault } from "./vault.ts";

/**
 * The renames made in the vault since the log started, so a sync that began before them
 * keeps reading and writing the files it means.
 */
export class RenameLog {
	private readonly moves: (readonly [from: string, to: string])[] = [];

	record(from: string, to: string): void {
		this.moves.push([from, to]);
	}

	/** Where the file or folder at `path` when the log started is now. */
	follow(path: string): string {
		let current = path;
		for (const [from, to] of this.moves) current = moved(current, from, to);
		return current;
	}

	/** Where the file or folder now at `path` was when the log started. */
	unfollow(path: string): string {
		let current = path;
		for (const [from, to] of this.moves.toReversed()) {
			current = moved(current, to, from);
		}
		return current;
	}

	/** `vault` as it was when the log started: each path reaches the file that was there then. */
	vault(vault: Vault): Vault {
		return {
			read: (path) => vault.read(this.follow(path)),
			write: (path, content) => vault.write(this.follow(path), content),
			remove: (path) => vault.remove(this.follow(path)),
			list: async (folder) =>
				(await vault.list(this.follow(folder))).map((path) =>
					this.unfollow(path),
				),
		};
	}

	/** `state` with each note's path moved to where its file is now, unless it left the wiki: then it reads as missing. */
	followState(state: WikiState, isNote: (path: string) => boolean): WikiState {
		const followed: Record<string, SyncedNote> = {};
		for (const [uri, note] of Object.entries(state)) {
			const path = this.follow(note.path);
			followed[uri] =
				path !== note.path && isNote(path) ? { ...note, path } : note;
		}
		return followed;
	}
}

function moved(path: string, from: string, to: string): string {
	return from && isWithin(path, from) ? to + path.slice(from.length) : path;
}
