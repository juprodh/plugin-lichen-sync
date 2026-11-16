import { expect, test } from "bun:test";
import { pullWiki } from "../../src/core/pull.ts";
import { pushWiki } from "../../src/core/push.ts";
import {
	fakeAppview,
	fakeNote,
	fakePds,
	memoryVault,
	noteUri,
	revisionUri,
	WIKI,
} from "./fakes.ts";

const AUTHOR = "did:plc:author";
const noWait = { attempts: 3, sleep: async () => {} };

async function pulled(notes = [fakeNote("a")]) {
	const { vault, files } = memoryVault();
	const { state } = await pullWiki(
		fakeAppview(notes).client,
		vault,
		WIKI,
		"notes",
		{},
	);
	return { notes, vault, files, state };
}

function push(
	notes: ReturnType<typeof fakeNote>[],
	vault: ReturnType<typeof memoryVault>["vault"],
	state: Awaited<ReturnType<typeof pulled>>["state"],
	{ editor = true, ingest = true } = {},
) {
	const pds = fakePds(notes, { ingest });
	const appview = fakeAppview(notes, { editors: editor ? [AUTHOR] : [] });
	const result = pushWiki(
		appview.client,
		pds.client,
		AUTHOR,
		vault,
		WIKI,
		"notes",
		state,
		noWait,
	);
	return { pds, result };
}

test("pushes an edit as a revision on the head and syncs once it is the head", async () => {
	const { notes, vault, files, state } = await pulled();
	files.set("notes/a.md", "a body, edited");

	const { pds, result } = push(notes, vault, state);
	const { state: after, report } = await result;

	expect(report.pushed).toEqual(["notes/a.md"]);
	expect(notes[0]?.content).toBe("a body, edited");
	expect(after[noteUri("a")]).toEqual({
		path: "notes/a.md",
		head: notes[0]?.head ?? "",
		base: "a body, edited",
	});
	expect(pds.records.map((r) => r.collection)).toEqual([
		"wiki.lichen.noteRevision",
		"wiki.lichen.noteSnapshot",
	]);
});

test("writes nothing on a head that moved since the last sync", async () => {
	const { notes, vault, files, state } = await pulled();
	files.set("notes/a.md", "a body, edited");
	notes[0] = fakeNote("a", { content: "moved", head: revisionUri("a-2") });

	const { pds, result } = push(notes, vault, state);

	expect((await result).report.behind).toEqual(["notes/a.md"]);
	expect(pds.records).toEqual([]);
});

test("keeps the sync state of a revision the appview never took as head", async () => {
	const { notes, vault, files, state } = await pulled();
	files.set("notes/a.md", "a body, edited");

	const { result } = push(notes, vault, state, { ingest: false });
	const { state: after, report } = await result;

	expect(report.pending).toEqual(["notes/a.md"]);
	expect(after).toEqual(state);
});

test("writes nothing for an account that cannot edit the wiki", async () => {
	const { notes, vault, files, state } = await pulled();
	files.set("notes/a.md", "a body, edited");

	const { pds, result } = push(notes, vault, state, { editor: false });

	await expect(result).rejects.toThrow("cannot edit");
	expect(pds.records).toEqual([]);
});

test("creates a note from a new file in the wiki's folder, titled by its name", async () => {
	const { notes, vault, files, state } = await pulled();
	files.set("notes/Getting Started.md", "hello");
	files.set("notes (conflicts)/a.md", "set aside");

	const { result } = push(notes, vault, state);
	const { state: after, report } = await result;

	expect(report.created).toEqual(["notes/Getting Started.md"]);
	const created = notes.find((n) => n.slug === "getting-started");
	expect(created).toMatchObject({ title: "Getting Started", content: "hello" });
	expect(after[created?.uri ?? ""]).toEqual({
		path: "notes/Getting Started.md",
		head: created?.head ?? "",
		base: "hello",
	});
});

test("writes nothing for a new file whose slug a deleted note holds", async () => {
	const { notes, vault, files, state } = await pulled();
	notes.push(fakeNote("old", { slug: "getting-started", deleted: true }));
	files.set("notes/Getting Started.md", "hello");

	const { pds, result } = push(notes, vault, state);

	expect((await result).report.taken).toEqual(["notes/Getting Started.md"]);
	expect(pds.records).toEqual([]);
});

test("follows a synced file renamed with its text unchanged, and creates nothing", async () => {
	const { notes, vault, files, state } = await pulled();
	files.delete("notes/a.md");
	files.set("notes/Renamed.md", "a body");

	const { pds, result } = push(notes, vault, state);
	const { state: after, report } = await result;

	expect(report.moved).toEqual(["notes/Renamed.md"]);
	expect(after[noteUri("a")]?.path).toBe("notes/Renamed.md");
	expect(pds.records).toEqual([]);
});

test("creates nothing while a synced file is missing, since a new file may be it renamed", async () => {
	const { notes, vault, files, state } = await pulled();
	files.delete("notes/a.md");
	files.set("notes/Renamed.md", "a body, edited");

	const { pds, result } = push(notes, vault, state);
	const { report } = await result;

	expect(report.missing).toEqual(["notes/a.md"]);
	expect(report.heldBack).toEqual(["notes/Renamed.md"]);
	expect(pds.records).toEqual([]);
});
