import { expect, test } from "bun:test";
import {
	holdsLoopbackSession,
	parsePluginData,
} from "../../src/core/plugin-data.ts";

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
	};
	expect<unknown>(parsePluginData(data)).toEqual(data);
});

test("falls back on missing or mistyped data", () => {
	const empty = { account: "", wikis: [] };
	expect(parsePluginData(null)).toEqual({ settings: empty, sync: {} });
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
		}),
	).toEqual({ settings: empty, sync: { wiki: {} } });
});

test("spots a session left in data.json, which signing in replaces", () => {
	expect(
		holdsLoopbackSession({ sessions: { "did:plc:bob": { tokenSet: {} } } }),
	).toBe(true);
	expect(holdsLoopbackSession({ sessions: {} })).toBe(false);
	expect(holdsLoopbackSession({ settings: {} })).toBe(false);
});
