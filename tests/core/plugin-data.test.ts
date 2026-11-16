import { expect, test } from "bun:test";
import { parsePluginData } from "../../src/core/plugin-data.ts";

test("keeps well-formed data", () => {
	const data = {
		settings: { owner: "alice.test", wikiSlug: "notes", account: "bob.test" },
		sync: { wiki: { note: { path: "notes/a.md", head: "r", base: "" } } },
		sessions: { "did:plc:bob": { tokenSet: {} } },
	};
	expect<unknown>(parsePluginData(data)).toEqual(data);
});

test("falls back on missing or mistyped data", () => {
	const empty = { owner: "", wikiSlug: "", account: "" };
	expect(parsePluginData(null)).toEqual({
		settings: empty,
		sync: {},
		sessions: {},
	});
	expect(
		parsePluginData({
			settings: { owner: 42 },
			sync: { wiki: { note: { path: "notes/a.md" } } },
			sessions: { "not-a-did": {}, "did:plc:bob": "token" },
		}),
	).toEqual({ settings: empty, sync: { wiki: {} }, sessions: {} });
});
