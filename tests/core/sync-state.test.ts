import { expect, test } from "bun:test";
import { renameSyncedPath } from "../../src/core/sync-state.ts";

const state = { note: { path: "notes/a.md", head: "r", base: "" } };

test("a rename within the folder moves the synced path", () => {
	expect(renameSyncedPath(state, "notes/a.md", "notes/b.md")).toEqual({
		note: { path: "notes/b.md", head: "r", base: "" },
	});
});

test("a move out of the folder, or of an unsynced file, leaves the state as is", () => {
	expect(renameSyncedPath(state, "notes/a.md", "elsewhere/a.md")).toBe(state);
	expect(renameSyncedPath(state, "notes/c.md", "notes/d.md")).toBe(state);
});
