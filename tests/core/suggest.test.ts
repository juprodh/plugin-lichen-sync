import { expect, test } from "bun:test";
import {
	actorQuery,
	matchWikis,
	mergeWikis,
	parseActors,
	parseWikiRef,
	type WikiChoice,
} from "../../src/core/suggest.ts";

test("asks the index only for a partial handle", () => {
	expect(actorQuery(" @al ")).toBe("al");
	expect(actorQuery("a")).toBeNull();
	expect(actorQuery("did:plc:alice")).toBeNull();
	expect(actorQuery("https://lichen.wiki/@alice")).toBeNull();
});

test("keeps actors with a usable handle, and Bluesky CDN avatars only", () => {
	expect(
		parseActors([
			{
				did: "did:plc:alice",
				handle: "alice.test",
				displayName: " ",
				avatar: "https://cdn.bsky.app/img/avatar/plain/did:plc:alice/cid",
			},
			{
				did: "did:plc:bob",
				handle: "bob.test",
				displayName: "Bob",
				avatar: "https://evil.example/a.png",
			},
			{ did: "did:plc:carol", handle: "handle.invalid" },
			{ did: "not-a-did", handle: "dan.test" },
			"junk",
		]),
	).toEqual([
		{
			did: "did:plc:alice",
			handle: "alice.test",
			displayName: null,
			avatar:
				"https://cdn.bsky.app/img/avatar_thumbnail/plain/did:plc:alice/cid",
		},
		{
			did: "did:plc:bob",
			handle: "bob.test",
			displayName: "Bob",
			avatar: null,
		},
	]);
	expect(parseActors(undefined)).toEqual([]);
});

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
