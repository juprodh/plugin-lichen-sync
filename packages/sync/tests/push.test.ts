import { expect, test } from "bun:test";
import { pullWiki } from "../src/pull.ts";
import { applyPush, planPush } from "../src/push.ts";
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

async function pulled(notes = [fakeNote("a")], folder = "notes") {
	const { vault, files } = memoryVault();
	const { state } = await pullWiki(
		fakeAppview(notes).client,
		vault,
		WIKI,
		folder,
		{},
	);
	return { notes, vault, files, state };
}

function push(
	notes: ReturnType<typeof fakeNote>[],
	vault: ReturnType<typeof memoryVault>["vault"],
	state: Awaited<ReturnType<typeof pulled>>["state"],
	{
		editor = true,
		ingest = true,
		folder = "notes",
		message = undefined as string | undefined,
	} = {},
) {
	const pds = fakePds(notes, { ingest });
	const appview = fakeAppview(notes, { editors: editor ? [AUTHOR] : [] });
	const result = planPush(vault, folder, state).then((plan) =>
		applyPush(
			appview.client,
			pds.client,
			AUTHOR,
			WIKI,
			state,
			plan,
			noWait,
			message,
		),
	);
	return { pds, result };
}

// The CLI lists this before asking for a message, so it must hold what a push writes and nothing it refuses.
test("plans from the vault alone the edits and notes a push writes, and refuses the rest", async () => {
	const { vault, files, state } = await pulled([fakeNote("a"), fakeNote("b")]);
	files.set("notes/a.md", "a body, edited");
	files.set("notes/Getting Started.md", "hello");
	files.set("notes/!!!.md", "a title with no slug");
	const tooLong = "x".repeat(1_000_001);
	files.set("notes/b.md", tooLong);
	files.set("notes/Huge.md", tooLong);

	const plan = await planPush(vault, "notes", state);

	expect(plan.edits.map((edit) => edit.synced.path)).toEqual(["notes/a.md"]);
	expect(plan.notes.map((note) => [note.path, note.slug])).toEqual([
		["notes/Getting Started.md", "getting-started"],
	]);
	expect(plan.refused.map((refusal) => refusal.path).sort()).toEqual([
		"notes/!!!.md",
		"notes/Huge.md",
		"notes/b.md",
	]);
});

test("reads a file saved with CRLF as the note's text, and an edit to it as LF", async () => {
	const { vault, files, state } = await pulled([
		fakeNote("a", { content: "one\ntwo\n" }),
		fakeNote("b", { content: "one\ntwo\n" }),
	]);
	files.set("notes/a.md", "one\r\ntwo\r\n");
	files.set("notes/b.md", "one\r\nTWO\r\n");

	const plan = await planPush(vault, "notes", state);

	expect(
		plan.edits.map(({ synced, content }) => [synced.path, content]),
	).toEqual([["notes/b.md", "one\nTWO\n"]]);
});

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

test("puts the sync's message on every revision it writes, and none for a blank one", async () => {
	const revisionMessages = async (message: string | undefined) => {
		const { notes, vault, files, state } = await pulled();
		files.set("notes/a.md", "a body, edited");
		files.set("notes/Getting Started.md", "hello");
		const { pds, result } = push(notes, vault, state, { message });
		await result;
		return pds.records
			.filter((r) => r.collection === "wiki.lichen.noteRevision")
			.map((r) => r.record.message);
	};

	expect(await revisionMessages("Planting notes")).toEqual([
		"Planting notes",
		"Planting notes",
	]);
	expect(await revisionMessages(" ")).toEqual([undefined, undefined]);
});

test("refuses a message lichen.wiki would refuse, writing nothing", async () => {
	const { notes, vault, files, state } = await pulled();
	files.set("notes/a.md", "a body, edited");
	files.set("notes/new.md", "hello");
	const { pds, result } = push(notes, vault, state, {
		message: "x".repeat(1025),
	});

	await expect(result).rejects.toThrow("Edit summary is too long (max 1024");
	expect(pds.records).toEqual([]);
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

test("a new file in a subfolder becomes a note too", async () => {
	const { notes, vault, files, state } = await pulled();
	files.set("notes/Projects/Plan.md", "plan");

	const { result } = push(notes, vault, state);

	expect((await result).report.created).toEqual(["notes/Projects/Plan.md"]);
});

test("a second new file of the same name is reported, even before lichen.wiki shows the first", async () => {
	const { notes, vault, files, state } = await pulled();
	files.set("notes/Projects/Plan.md", "first");
	files.set("notes/Archive/Plan.md", "second");

	const { pds, result } = push(notes, vault, state, {
		ingest: false,
	});
	const { report } = await result;

	expect(report.pending).toEqual(["notes/Projects/Plan.md"]);
	expect(report.taken).toEqual(["notes/Archive/Plan.md"]);
	expect(
		pds.records.filter((r) => r.collection === "wiki.lichen.note"),
	).toHaveLength(1);
});

test("a whole-vault wiki syncs at the root and leaves its conflict copies out", async () => {
	const { notes, vault, files, state } = await pulled([fakeNote("a")], "");
	expect(Object.values(state).map((note) => note.path)).toEqual(["a.md"]);
	files.set("Projects/Plan.md", "plan");
	files.set("Lichen conflicts/Aside.md", "set aside");

	const { result } = push(notes, vault, state, { folder: "" });

	expect((await result).report.created).toEqual(["Projects/Plan.md"]);
});
