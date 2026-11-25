import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	fakeAppview,
	fakeNote,
	fakePds,
	OWNER,
	WIKI,
} from "../../sync/tests/fakes.ts";
import { lichen, signedInAs } from "./terminal.ts";

const WIKI_REF = `@${OWNER}/notes`;

async function setUp({ signedIn = true, editor = true } = {}) {
	const notes = [fakeNote("a"), fakeNote("b")];
	const pds = fakePds(notes);
	const appview = fakeAppview(notes, { editors: editor ? [OWNER] : [] });
	const folder = await mkdtemp(join(tmpdir(), "lichen-folder-"));
	const env = signedIn
		? await signedInAs(OWNER)
		: { XDG_CONFIG_HOME: "/nowhere" };
	const sync = (
		args: string[],
		extra: { answers?: string[]; cwd?: string } = {},
	) =>
		lichen(["sync", ...args], {
			env,
			cwd: folder,
			appview: appview.client,
			pds: async () => pds.client,
			...extra,
		});
	const file = (path: string) => readFile(join(folder, path), "utf8");
	const revisions = () =>
		pds.records.filter((r) => r.collection === "wiki.lichen.noteRevision");
	return { folder, sync, file, revisions, notes };
}

test("links a folder to the wiki it names, bringing in its notes", async () => {
	const { sync, file } = await setUp({ signedIn: false });

	const { code, stdout } = await sync([WIKI_REF]);

	expect(code).toBe(0);
	expect(await file("a.md")).toBe("a body");
	expect(await file("b.md")).toBe("b body");
	expect(JSON.parse(await file(".lichen/state.json")).wiki).toBe(WIKI);
	expect(stdout).toContain("↓ a.md");
	expect(stdout).toContain(`${WIKI_REF} and this folder match`);
});

test("publishes edits and new files, hidden ones aside, with the message given, then matches", async () => {
	const { folder, sync, revisions } = await setUp();
	await sync([WIKI_REF]);
	await writeFile(join(folder, "a.md"), "a body, edited");
	await writeFile(join(folder, "Getting Started.md"), "hello");
	await mkdir(join(folder, ".obsidian"));
	await writeFile(join(folder, ".obsidian", "hidden.md"), "not a note");

	const { code, stdout } = await sync(["-m", "Planting notes"]);

	expect(code).toBe(0);
	expect(stdout).toContain("↑ a.md\n");
	expect(stdout).toContain("↑ Getting Started.md (new)");
	expect(revisions().map((r) => r.record.message)).toEqual([
		"Planting notes",
		"Planting notes",
	]);
	expect((await sync([])).code).toBe(0);
	expect(revisions()).toHaveLength(2);
});

test("lists what it publishes and asks a person for the message", async () => {
	const { folder, sync, revisions } = await setUp();
	await sync([WIKI_REF]);
	await writeFile(join(folder, "a.md"), "a body, edited");
	await writeFile(join(folder, "new.md"), "hello");

	const { asked, stderr } = await sync([], { answers: ["Planting notes"] });

	expect(stderr).toContain("~ a.md");
	expect(stderr).toContain("+ new.md");
	expect(asked).toEqual(["Describe your changes (Enter to skip)"]);
	expect(revisions().map((r) => r.record.message)).toEqual([
		"Planting notes",
		"Planting notes",
	]);
});

test("publishes with no message when no one can be asked", async () => {
	const { folder, sync, revisions } = await setUp();
	await sync([WIKI_REF]);
	await writeFile(join(folder, "a.md"), "a body, edited");

	expect((await sync([])).code).toBe(0);
	expect(revisions().map((r) => r.record.message)).toEqual([undefined]);
});

test("refuses a message lichen.wiki would drop, publishing nothing", async () => {
	const { folder, sync, revisions } = await setUp();
	await sync([WIKI_REF]);
	await writeFile(join(folder, "a.md"), "a body, edited");

	const { code, stderr } = await sync(["-m", "x".repeat(1025)]);

	expect(code).toBe(1);
	expect(stderr).toContain("Edit summary is too long");
	expect(revisions()).toEqual([]);
});

test("keeps edits it cannot publish, and says why, exiting 1", async () => {
	for (const [setup, reason] of [
		[{ signedIn: false }, "lichen login"],
		[{ editor: false }, "You cannot edit"],
	] as const) {
		const { folder, sync, revisions, file } = await setUp(setup);
		await sync([WIKI_REF]);
		await writeFile(join(folder, "a.md"), "a body, edited");

		const { code, stdout } = await sync([]);

		expect(code).toBe(1);
		expect(stdout).toContain(reason);
		expect(await file("a.md")).toBe("a body, edited");
		expect(revisions()).toEqual([]);
	}
});

test("removes a note deleted on lichen.wiki, and keeps an edit to one as a copy", async () => {
	const { folder, sync, file, notes } = await setUp({ signedIn: false });
	await sync([WIKI_REF]);
	await writeFile(join(folder, "b.md"), "b body, edited");
	for (const note of notes) note.deleted = true;

	const { code, stdout } = await sync([]);

	expect(code).toBe(1);
	expect(stdout).toContain("↓ a.md (deleted on lichen.wiki)");
	expect(stdout).toContain("your version is in: Lichen conflicts/b.md");
	expect(file("a.md")).rejects.toThrow();
	expect(file("b.md")).rejects.toThrow();
	expect(await file("Lichen conflicts/b.md")).toBe("b body, edited");
	expect((await sync([])).code).toBe(0);
});

test("finds the linked folder from a subfolder, and keeps it to its wiki", async () => {
	const { folder, sync } = await setUp({ signedIn: false });
	await sync([WIKI_REF]);
	const sub = join(folder, "drafts");
	await mkdir(sub);

	expect((await sync([], { cwd: sub })).code).toBe(0);
	const other = await sync([`@${OWNER}/elsewhere`], { cwd: sub });
	expect(other.code).toBe(1);
	expect(other.stderr).toContain(`${folder} already syncs with ${WIKI}`);
});

test("asks a person which wiki an unlinked folder syncs with, offering theirs", async () => {
	const { sync, file } = await setUp();

	const { code, stderr, asked } = await sync([], { answers: ["1"] });

	expect(code).toBe(0);
	expect(stderr).toContain(`1. ${WIKI_REF}  Notes`);
	expect(asked).toHaveLength(1);
	expect(JSON.parse(await file(".lichen/state.json")).wiki).toBe(WIKI);
});

test("links no folder unasked", async () => {
	const { sync, folder } = await setUp();

	const unnamed = await sync([]);
	expect(unnamed.code).toBe(1);
	expect(unnamed.stderr).toContain("lichen sync @owner/slug");

	const fromRoot = await sync([WIKI_REF], { cwd: "/" });
	expect(fromRoot.code).toBe(1);
	expect(fromRoot.stderr).toContain("not in /");

	expect(readFile(join(folder, ".lichen/state.json"))).rejects.toThrow();
});
