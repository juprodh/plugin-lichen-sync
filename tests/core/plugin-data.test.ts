import { expect, test } from "bun:test";
import { parsePluginData } from "../../src/core/plugin-data.ts";

test("keeps well-formed data", () => {
	const data = {
		settings: { owner: "alice.test", wikiSlug: "notes" },
		sync: { wiki: { note: { path: "notes/a.md", head: "r", base: "" } } },
	};
	expect(parsePluginData(data)).toEqual(data);
});

test("falls back on missing or mistyped data", () => {
	expect(parsePluginData(null)).toEqual({
		settings: { owner: "", wikiSlug: "" },
		sync: {},
	});
	expect(
		parsePluginData({
			settings: { owner: 42 },
			sync: { wiki: { note: { path: "notes/a.md" } } },
		}),
	).toEqual({ settings: { owner: "", wikiSlug: "" }, sync: { wiki: {} } });
});
