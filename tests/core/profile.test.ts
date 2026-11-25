import { expect, test } from "bun:test";
import { getProfile } from "../../src/core/profile.ts";

const ALICE = "did:plc:alice";

test("reads a profile from the Bluesky appview as an actor", async () => {
	const asked: string[] = [];
	const actor = await getProfile(async (url) => {
		asked.push(url);
		return { did: ALICE, handle: "alice.test", displayName: "Alice" };
	}, ALICE);

	expect(asked).toEqual([
		"https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=did%3Aplc%3Aalice",
	]);
	expect(actor).toEqual({
		did: ALICE,
		handle: "alice.test",
		displayName: "Alice",
		avatar: null,
	});
});

test("is null for a profile with no usable handle", async () => {
	const actor = await getProfile(
		async () => ({ did: ALICE, handle: "handle.invalid" }),
		ALICE,
	);
	expect(actor).toBeNull();
});
