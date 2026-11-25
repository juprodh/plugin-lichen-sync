import { expect, test } from "bun:test";
import { Client } from "@atcute/client";
import { lichen } from "./terminal.ts";

const STAMP = "2026-01-01T00:00:00.000Z";

function wiki(slug: string, extra: object) {
	return {
		uri: `at://did:plc:alice/wiki.lichen.wiki/${slug}`,
		did: "did:plc:alice",
		slug,
		description: "",
		language: "en",
		noteCount: 1,
		createdAt: STAMP,
		updatedAt: STAMP,
		role: "owner",
		...extra,
	};
}

const appview = new Client({
	handler: async (pathname) =>
		Response.json(
			pathname.startsWith("/xrpc/wiki.lichen.listWikis")
				? {
						wikis: [
							wiki("garden", { name: "Garden", ownerHandle: "alice.test" }),
							wiki("recipes", { name: "Recipes", noteCount: 3 }),
						],
					}
				: { error: "MethodNotImplemented" },
			{
				status: pathname.startsWith("/xrpc/wiki.lichen.listWikis") ? 200 : 501,
			},
		),
});

test("lists an owner's wikis by the @owner/slug sync takes, signed out", async () => {
	const { code, stdout } = await lichen(["list", "@did:plc:alice"], {
		appview,
		env: { XDG_CONFIG_HOME: "/nowhere" },
	});

	expect(code).toBe(0);
	expect(stdout).toBe(
		"@alice.test/garden  Garden  1 note\n@did:plc:alice/recipes  Recipes  3 notes\n",
	);
});

test("lists your own wikis only once signed in", async () => {
	const { code, stdout, stderr } = await lichen(["list"], {
		appview,
		env: { XDG_CONFIG_HOME: "/nowhere" },
	});

	expect(code).toBe(1);
	expect(stdout).toBe("");
	expect(stderr).toContain("lichen login");
});
