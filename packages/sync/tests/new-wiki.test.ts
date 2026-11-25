import { expect, test } from "bun:test";
import { createWiki } from "../src/new-wiki.ts";
import { fakePds, fakeWikiAppview, OWNER } from "./fakes.ts";

const owner = { did: OWNER, handle: "owner.test" } as const;
const noWait = { attempts: 3, sleep: async () => {} };

test("publishes the wiki and its owner's grant in one commit, then waits until the owner can write", async () => {
	const pds = fakePds([]);
	const appview = fakeWikiAppview(pds, { polls: 1 });

	const outcome = await createWiki(
		appview.client,
		pds.client,
		owner,
		{ name: "Field Notes", slug: "", language: "en" },
		noWait,
	);

	expect(outcome).toEqual({
		wiki: {
			uri: "at://did:plc:owner/wiki.lichen.wiki/field-notes",
			ownerDid: OWNER,
			ownerHandle: owner.handle,
			slug: "field-notes",
			name: "Field Notes",
			noteCount: 0,
			role: "admin",
		},
		seen: true,
	});
	expect(pds.records.map((r) => r.collection)).toEqual([
		"wiki.lichen.wiki",
		"wiki.lichen.membership",
	]);
	expect(pds.records[0]?.record.visibility).toBe("public");
});

test("stores a description as lichen.wiki does", async () => {
	const description = async (typed: string) => {
		const pds = fakePds([]);
		await createWiki(
			fakeWikiAppview(pds).client,
			pds.client,
			owner,
			{ name: "Garden", slug: "", language: "en", description: typed },
			noWait,
		);
		return pds.records[0]?.record.description;
	};

	expect(await description("  What grows where  ")).toBe("What grows where");
	expect(await description(" ")).toBeUndefined();
});

test("takes the address typed over the one the name gives", async () => {
	const pds = fakePds([]);

	const outcome = await createWiki(
		fakeWikiAppview(pds).client,
		pds.client,
		owner,
		{ name: "日本の植物", slug: "plants", language: "ja" },
		noWait,
	);

	expect("wiki" in outcome && outcome.wiki.slug).toBe("plants");
});

test("refuses an address the owner's repo already holds, writing nothing", async () => {
	const pds = fakePds([]);
	const appview = fakeWikiAppview(pds);
	await createWiki(
		appview.client,
		pds.client,
		owner,
		{ name: "Garden", slug: "", language: "en" },
		noWait,
	);

	const again = await createWiki(
		fakeWikiAppview(pds).client,
		pds.client,
		owner,
		{ name: "Garden", slug: "", language: "en" },
		noWait,
	);

	expect(again).toEqual({
		problem: { code: "wikiSlugExists", slug: "garden" },
	});
	expect(pds.records).toHaveLength(2);
});

test("refuses an address lichen.wiki still holds a wiki at", async () => {
	const pds = fakePds([]);
	const appview = fakeWikiAppview(pds, {
		known: ["at://did:plc:owner/wiki.lichen.wiki/garden"],
	});

	const outcome = await createWiki(
		appview.client,
		pds.client,
		owner,
		{ name: "Garden", slug: "", language: "en" },
		noWait,
	);

	expect(outcome).toEqual({
		problem: { code: "wikiSlugExists", slug: "garden" },
	});
	expect(pds.records).toEqual([]);
});

test("refuses what lichen.wiki's form refuses, before writing", async () => {
	const pds = fakePds([]);

	const outcome = await createWiki(
		fakeWikiAppview(pds).client,
		pds.client,
		owner,
		{ name: "日本の植物", slug: "", language: "ja" },
		noWait,
	);

	expect(outcome).toEqual({ problem: { code: "wikiSlugRequired" } });
	expect(pds.records).toEqual([]);
});

test("returns the wiki unseen when lichen.wiki has not taken it in by the end of the wait", async () => {
	const pds = fakePds([]);
	const appview = fakeWikiAppview(pds, { polls: noWait.attempts });

	const outcome = await createWiki(
		appview.client,
		pds.client,
		owner,
		{ name: "Garden", slug: "", language: "en" },
		noWait,
	);

	expect("seen" in outcome && outcome.seen).toBe(false);
	expect(pds.records).toHaveLength(2);
});
