import { expect, test } from "bun:test";
import {
	bookmarkedWikis,
	matchWikis,
	mergeWikis,
	parseWikiRef,
	type WikiChoice,
} from "../src/wiki-search.ts";
import { fakePds, fakeWikiAppview } from "./fakes.ts";

const choice = (name: string, slug: string, handle: string): WikiChoice => ({
	uri: `at://did:plc:x/wiki.lichen.wiki/${slug}`,
	ownerDid: "did:plc:x",
	ownerHandle: handle,
	slug,
	name,
	noteCount: 0,
	role: null,
});

test("matches a wiki by name, slug or owner handle", () => {
	const garden = choice("Garden Notes", "garden", "alice.test");
	const recipes = choice("Recipes", "cooking", "bob.test");
	expect(matchWikis([garden, recipes], "")).toEqual([garden, recipes]);
	expect(matchWikis([garden, recipes], "NOTES")).toEqual([garden]);
	expect(matchWikis([garden, recipes], "cook")).toEqual([recipes]);
	expect(matchWikis([garden, recipes], "@bob")).toEqual([recipes]);
});

test("merges search results after your own wikis, each once", () => {
	const mine = { ...choice("Garden", "garden", "alice.test"), role: "owner" };
	const found = [
		choice("Garden", "garden", "alice.test"),
		choice("Recipes", "cooking", "bob.test"),
	];
	expect(mergeWikis([mine], found).map((w) => [w.slug, w.role])).toEqual([
		["garden", "owner"],
		["cooking", null],
	]);
});

test("reads a wiki from a lichen.wiki link or an @ path", () => {
	expect(
		parseWikiRef("https://lichen.wiki/@alice.test/garden/some-note"),
	).toEqual({
		actor: "alice.test",
		slug: "garden",
	});
	expect(parseWikiRef("lichen.wiki/@did:plc:alice/garden?x=1")).toEqual({
		actor: "did:plc:alice",
		slug: "garden",
	});
	expect(parseWikiRef("@alice.test/")).toEqual({
		actor: "alice.test",
		slug: null,
	});
	expect(parseWikiRef("@alice.test")).toBeNull();
	expect(parseWikiRef("https://example.com/@alice.test/garden")).toBeNull();
});

test("lists the bookmarked wikis lichen.wiki shows, each once, across pages", async () => {
	const reader = "did:plc:reader";
	const garden = "at://did:plc:alice/wiki.lichen.wiki/garden";
	const recipes = "at://did:plc:bob/wiki.lichen.wiki/recipes";
	const pds = fakePds([]);
	const bookmark = (subject: string, i: number) => ({
		uri: `at://${reader}/community.lexicon.bookmarks.bookmark/${i}`,
		collection: "community.lexicon.bookmarks.bookmark",
		record: { subject, createdAt: "2026-01-01T00:00:00.000Z" },
	});
	pds.records.push(
		bookmark("https://example.com/an-article", 0),
		bookmark("at://did:plc:alice/wiki.lichen.note/abc", 1),
		bookmark("at://did:plc:carol/wiki.lichen.wiki/private", 2),
		...Array.from({ length: 100 }, (_, i) => bookmark(garden, i + 3)),
		bookmark(recipes, 103),
	);
	const appview = fakeWikiAppview(pds, { known: [garden, recipes] });

	const wikis = await bookmarkedWikis(appview.client, pds.client, reader);

	expect(wikis.map((wiki) => wiki.uri)).toEqual([garden, recipes]);
});
