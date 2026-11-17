import { expect, test } from "bun:test";
import { isNotePath } from "../../src/core/folders.ts";
import {
	moveSyncedFolder,
	renameSyncedPath,
} from "../../src/core/sync-state.ts";

const state = { note: { path: "notes/a.md", head: "r", base: "" } };
const isNote = (path: string) => isNotePath("notes", path);

test("a rename within the wiki moves the synced path, into a subfolder too", () => {
	expect(renameSyncedPath(state, "notes/a.md", "notes/b.md", isNote)).toEqual({
		note: { path: "notes/b.md", head: "r", base: "" },
	});
	expect(
		renameSyncedPath(state, "notes/a.md", "notes/sub/a.md", isNote),
	).toEqual({ note: { path: "notes/sub/a.md", head: "r", base: "" } });
});

test("a move out of the wiki, or of an unsynced file, leaves the state as is", () => {
	expect(renameSyncedPath(state, "notes/a.md", "elsewhere/a.md", isNote)).toBe(
		state,
	);
	expect(renameSyncedPath(state, "notes/c.md", "notes/d.md", isNote)).toBe(
		state,
	);
});

test("a folder move carries the notes under it, and only those", () => {
	const two = {
		a: { path: "notes/a.md", head: "r", base: "" },
		b: { path: "notes-old/b.md", head: "r", base: "" },
	};
	expect(moveSyncedFolder(two, "notes", "wikis/notes", () => true)).toEqual({
		a: { path: "wikis/notes/a.md", head: "r", base: "" },
		b: { path: "notes-old/b.md", head: "r", base: "" },
	});
});

test("a subfolder moved out of the wiki leaves its notes to read as missing", () => {
	const nested = { a: { path: "notes/sub/a.md", head: "r", base: "" } };
	expect(moveSyncedFolder(nested, "notes/sub", "notes/sub2", isNote)).toEqual({
		a: { path: "notes/sub2/a.md", head: "r", base: "" },
	});
	expect(moveSyncedFolder(nested, "notes/sub", "elsewhere/sub", isNote)).toBe(
		nested,
	);
});
