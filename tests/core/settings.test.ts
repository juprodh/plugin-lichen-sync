import { expect, test } from "bun:test";
import {
	folderClash,
	followFolderRename,
	isNotePath,
	normalizeFolder,
	parseSettings,
	type SyncedWiki,
	wikiRef,
} from "../../src/core/settings.ts";

const wiki = (folder: string, slug = "notes"): SyncedWiki => ({
	uri: `at://did:plc:alice/wiki.lichen.wiki/${slug}`,
	folder,
	name: "",
	ownerHandle: "",
	pulledAt: "",
});

test("normalizes a typed folder", () => {
	expect(normalizeFolder(" /Lichen\\ notes / garden/ ")).toBe(
		"Lichen/notes/garden",
	);
	expect(normalizeFolder("/")).toBe("");
});

test("names a wiki by handle, or by DID until the handle is known", () => {
	expect(wikiRef({ ...wiki("a"), ownerHandle: "alice.test" })).toBe(
		"@alice.test/notes",
	);
	expect(wikiRef(wiki("a"))).toBe("@did:plc:alice/notes");
});

test("wiki folders cannot hold one another", () => {
	const wikis = [wiki("Lichen/garden", "garden")];
	expect(folderClash("Lichen/garden", wikis)).toBe(wikis[0]);
	expect(folderClash("Lichen", wikis)).toBe(wikis[0]);
	expect(folderClash("Lichen/garden/sub", wikis)).toBe(wikis[0]);
	expect(folderClash("Lichen/garden2", wikis)).toBeUndefined();
	expect(folderClash("Lichen", wikis, wikis[0]?.uri)).toBeUndefined();
});

test("a renamed folder carries the wikis at or under it", () => {
	const wikis = [wiki("Lichen/garden", "garden"), wiki("Other", "other")];
	expect(
		followFolderRename(wikis, "Lichen", "Wikis").map((w) => w.folder),
	).toEqual(["Wikis/garden", "Other"]);
});

test("a whole-vault wiki holds every folder, so it syncs alone", () => {
	const wikis = [wiki("", "vault")];
	expect(folderClash("Lichen", wikis)).toBe(wikis[0]);
	expect(folderClash("", [wiki("Lichen")])).toBeDefined();
	expect(followFolderRename(wikis, "Lichen", "Wikis")).toEqual(wikis);
});

test("keeps the vault's root as a folder, and drops a wiki with none", () => {
	const uri = "at://did:plc:alice/wiki.lichen.wiki/notes";
	const { wikis } = parseSettings({
		wikis: [{ uri, folder: "" }, { uri, folder: "a" }, { uri }],
	});
	expect(wikis.map((w) => w.folder)).toEqual(["", "a"]);
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
