import { expect, test } from "bun:test";
import { pullWiki } from "../../src/core/pull.ts";
import {
	type FakeNote,
	fakeAppview,
	fakeNote,
	memoryVault,
	noteUri,
	revisionUri,
	WIKI,
} from "./fakes.ts";

test("a first pull names files as the export does", async () => {
	const { client } = fakeAppview([
		fakeNote("a", { title: "Why: a/b?" }),
		fakeNote("b", { title: "Same" }),
		fakeNote("c", { title: "same" }),
		fakeNote("d", { slug: "_sidebar", title: "Sidebar" }),
	]);
	const { vault, files } = memoryVault();

	await pullWiki(client, vault, WIKI, "notes", {});

	expect([...files.keys()].sort()).toEqual([
		"notes/Same.md",
		"notes/Why ab.md",
		"notes/_sidebar.md",
		"notes/same-2.md",
	]);
});

test("an unchanged head fetches and writes nothing", async () => {
	const notes = [fakeNote("a")];
	const { vault } = memoryVault();
	const { state } = await pullWiki(
		fakeAppview(notes).client,
		vault,
		WIKI,
		"notes",
		{},
	);

	const second = fakeAppview(notes);
	const { report } = await pullWiki(second.client, vault, WIKI, "notes", state);

	expect(second.fetched).toEqual([]);
	expect(report.written).toEqual([]);
});

test("a moved head merges into a file edited here, or leaves a conflict copy", async () => {
	const notes = [
		fakeNote("a", { content: "one\ntwo\nthree\n" }),
		fakeNote("b", { content: "one\ntwo\nthree\n" }),
	];
	const { vault, files } = memoryVault();
	const { state } = await pullWiki(
		fakeAppview(notes).client,
		vault,
		WIKI,
		"notes",
		{},
	);
	files.set("notes/a.md", "zero\none\ntwo\nthree\n");
	files.set("notes/b.md", "one\nTWO here\nthree\n");
	for (const note of notes) {
		note.content = "one\nTWO there\nthree\n";
		note.head = revisionUri(`${note.slug}-2`);
	}

	const { state: after, report } = await pullWiki(
		fakeAppview(notes).client,
		vault,
		WIKI,
		"notes",
		state,
	);

	expect(files.get("notes/a.md")).toBe("zero\none\nTWO there\nthree\n");
	expect(report.merged).toEqual(["notes/a.md"]);
	expect(files.get("notes/b.md")).toBe("one\nTWO there\nthree\n");
	expect(files.get("notes (conflicts)/b.md")).toBe("one\nTWO here\nthree\n");
	expect(report.conflictCopies).toEqual(["notes (conflicts)/b.md"]);
	expect(after[noteUri("a")]?.base).toBe("one\nTWO there\nthree\n");
});

test("records the head getNote returned, not the listed one", async () => {
	const { client } = fakeAppview([
		fakeNote("a", {
			listedHead: revisionUri("a-1"),
			head: revisionUri("a-2"),
		}),
	]);

	const { state } = await pullWiki(
		client,
		memoryVault().vault,
		WIKI,
		"notes",
		{},
	);

	expect(state[noteUri("a")]?.head).toBe(revisionUri("a-2"));
});

test("without sync state, a file at the note's name is taken, its text set aside if it differs", async () => {
	const { client } = fakeAppview([fakeNote("a"), fakeNote("b")]);
	const { vault, files } = memoryVault({
		"notes/a.md": "a body",
		"notes/b.md": "b at some older revision",
	});

	const { state, report } = await pullWiki(client, vault, WIKI, "notes", {});

	expect(report.written).toEqual([]);
	expect(report.recoveredCopies).toEqual(["notes (conflicts)/b.md"]);
	expect(files.get("notes/b.md")).toBe("b body");
	expect(files.get("notes (conflicts)/b.md")).toBe("b at some older revision");
	expect(Object.values(state).map((s) => s.path)).toEqual([
		"notes/a.md",
		"notes/b.md",
	]);
});

test("a whole-vault wiki writes at the root and keeps conflict copies in their own folder", async () => {
	const notes = [fakeNote("b", { content: "one\n" })];
	const { vault, files } = memoryVault();
	const { state } = await pullWiki(
		fakeAppview(notes).client,
		vault,
		WIKI,
		"",
		{},
	);
	expect(files.get("b.md")).toBe("one\n");
	files.set("b.md", "mine\n");
	notes[0] = {
		...(notes[0] as FakeNote),
		content: "theirs\n",
		head: revisionUri("b-2"),
	};

	const { report } = await pullWiki(
		fakeAppview(notes).client,
		vault,
		WIKI,
		"",
		state,
	);

	expect(report.conflictCopies).toEqual(["Lichen conflicts/b.md"]);
	expect(files.get("Lichen conflicts/b.md")).toBe("mine\n");
});
