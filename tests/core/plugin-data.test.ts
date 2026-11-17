import { expect, test } from "bun:test";
import { parsePluginData } from "../../src/core/plugin-data.ts";

test("keeps well-formed data", () => {
	const data = {
		settings: {
			account: "bob.test",
			wikis: [
				{
					uri: "at://did:plc:alice/wiki.lichen.wiki/notes",
					folder: "Lichen/notes",
					name: "Notes",
					ownerHandle: "alice.test",
					pulledAt: "2026-11-17T10:00:00.000Z",
				},
			],
		},
		sync: { wiki: { note: { path: "notes/a.md", head: "r", base: "" } } },
		sessions: { "did:plc:bob": { tokenSet: {} } },
	};
	expect<unknown>(parsePluginData(data)).toEqual(data);
});

test("falls back on missing or mistyped data", () => {
	const empty = { account: "", wikis: [] };
	expect(parsePluginData(null)).toEqual({
		settings: empty,
		sync: {},
		sessions: {},
	});
	expect(
		parsePluginData({
			settings: {
				account: 42,
				wikis: [
					{ uri: "not-a-uri", folder: "a" },
					{ uri: "at://did:plc:a/c/k" },
				],
			},
			sync: { wiki: { note: { path: "notes/a.md" } } },
			sessions: { "not-a-did": {}, "did:plc:bob": "token" },
		}),
	).toEqual({ settings: empty, sync: { wiki: {} }, sessions: {} });
});
