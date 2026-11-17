import { expect, test } from "bun:test";
import { isNotePath, normalizeFolder } from "../../src/core/folders.ts";

test("normalizes a typed folder", () => {
	expect(normalizeFolder(" /Lichen\\ notes / garden/ ")).toBe(
		"Lichen/notes/garden",
	);
	expect(normalizeFolder("/")).toBe("");
});

test("a note is a markdown file in the wiki's folder or its subfolders", () => {
	expect(isNotePath("notes", "notes/a.md")).toBe(true);
	expect(isNotePath("notes", "notes/sub/a.md")).toBe(true);
	expect(isNotePath("notes", "notes2/a.md")).toBe(false);
	expect(isNotePath("notes", "notes (conflicts)/a.md")).toBe(false);
});

test("a whole-vault wiki leaves its conflict copies out", () => {
	expect(isNotePath("", "a.md")).toBe(true);
	expect(isNotePath("", "Projects/a.md")).toBe(true);
	expect(isNotePath("", "Lichen conflicts/a.md")).toBe(false);
});
