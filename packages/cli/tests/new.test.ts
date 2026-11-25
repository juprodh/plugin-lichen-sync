import { expect, test } from "bun:test";
import { fakePds, fakeWikiAppview, OWNER } from "../../sync/tests/fakes.ts";
import { lichen, signedInAs } from "./terminal.ts";

async function newWiki(args: string[], answers?: string[]) {
	const pds = fakePds([]);
	const result = await lichen(["new", ...args], {
		env: await signedInAs(OWNER),
		appview: fakeWikiAppview(pds).client,
		pds: async () => pds.client,
		...(answers ? { answers } : {}),
	});
	return { ...result, wiki: pds.records[0]?.record };
}

test("creates the wiki from options alone, and says how to fill it", async () => {
	const { code, stdout, stderr, wiki } = await newWiki([
		"Garden",
		"notes",
		"--description",
		"What grows where",
		"--language",
		"fr",
	]);

	expect(code).toBe(0);
	expect(wiki).toMatchObject({
		name: "Garden notes",
		description: "What grows where",
		language: "fr",
	});
	expect(stdout).toBe(
		`✓ Created Garden notes: https://lichen.wiki/@${OWNER}/garden-notes\n`,
	);
	expect(stderr).toContain(`lichen sync @${OWNER}/garden-notes`);
});

test("asks a person for what the options left out, offering the address the name gives", async () => {
	const { code, asked, wiki } = await newWiki(
		["--language", "en"],
		["Garden notes", "", "What grows where"],
	);

	expect(code).toBe(0);
	expect(asked).toEqual([
		"Name",
		`Address: lichen.wiki/@${OWNER}/`,
		"Description (Enter to skip)",
	]);
	expect(wiki).toMatchObject({
		name: "Garden notes",
		description: "What grows where",
	});
});

test("refuses without a name when no one can be asked, writing nothing", async () => {
	const { code, stderr, wiki } = await newWiki([]);

	expect(code).toBe(1);
	expect(stderr).toContain("Wiki name is required.");
	expect(wiki).toBeUndefined();
});

test("says why lichen.wiki would refuse the wiki, exiting 1", async () => {
	const { code, stderr, wiki } = await newWiki([
		"日本の植物",
		"--language",
		"ja",
	]);

	expect(code).toBe(1);
	expect(stderr).toContain("That name can't be turned into a URL");
	expect(wiki).toBeUndefined();
});
