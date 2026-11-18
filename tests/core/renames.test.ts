import { expect, test } from "bun:test";
import { isNotePath } from "../../src/core/folders.ts";
import { RenameLog } from "../../src/core/renames.ts";
import { memoryVault } from "./fakes.ts";

test("follows file and folder renames in order, and back", () => {
	const log = new RenameLog();
	log.record("notes/a.md", "notes/b.md");
	log.record("notes", "archive/notes");
	expect(log.follow("notes/a.md")).toBe("archive/notes/b.md");
	expect(log.follow("notes/c.md")).toBe("archive/notes/c.md");
	expect(log.follow("notes-old/a.md")).toBe("notes-old/a.md");
	expect(log.unfollow("archive/notes/b.md")).toBe("notes/a.md");
});

test("a file taking a renamed file's old name stays apart from it", () => {
	const log = new RenameLog();
	log.record("notes/a.md", "notes/b.md");
	log.record("notes/c.md", "notes/a.md");
	expect(log.follow("notes/a.md")).toBe("notes/b.md");
	expect(log.unfollow("notes/a.md")).toBe("notes/c.md");
});

test("the vault reads, writes and lists the files as they were when the log started", async () => {
	const { vault, files } = memoryVault({ "notes/a.md": "local" });
	const log = new RenameLog();
	const before = log.vault(vault);
	files.set("notes/b.md", files.get("notes/a.md") as string);
	files.delete("notes/a.md");
	log.record("notes/a.md", "notes/b.md");

	expect(await before.read("notes/a.md")).toBe("local");
	await before.write("notes/a.md", "merged");
	expect(Object.fromEntries(files)).toEqual({ "notes/b.md": "merged" });
	expect(await before.list("notes")).toEqual(["notes/a.md"]);
});

test("the state follows renames within the wiki, and keeps a path that left it", () => {
	const log = new RenameLog();
	log.record("notes/a.md", "notes/sub/a.md");
	log.record("notes/b.md", "elsewhere/b.md");
	const state = {
		a: { path: "notes/a.md", head: "r", base: "" },
		b: { path: "notes/b.md", head: "r", base: "" },
	};
	expect(log.followState(state, (path) => isNotePath("notes", path))).toEqual({
		a: { path: "notes/sub/a.md", head: "r", base: "" },
		b: { path: "notes/b.md", head: "r", base: "" },
	});
});
