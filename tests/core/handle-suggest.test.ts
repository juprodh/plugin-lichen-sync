import { expect, test } from "bun:test";
import { actorQuery, parseActors } from "../../src/core/handle-suggest.ts";

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
