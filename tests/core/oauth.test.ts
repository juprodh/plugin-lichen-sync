import { expect, test } from "bun:test";
import type { StoredSession } from "@atcute/oauth-node-client";
import {
	lichenOAuth,
	type Sessions,
	signedInDid,
} from "../../src/core/oauth.ts";

const session = {
	tokenSet: { sub: "did:plc:bob" },
} as unknown as StoredSession;

function savedSessions(initial: Sessions = {}) {
	let sessions = initial;
	const store = {
		get: () => sessions,
		save: async (next: Sessions) => {
			sessions = next;
		},
	};
	return { store, current: () => sessions };
}

test("the loopback client asks for Lichen's permission set", () => {
	const { store } = savedSessions();
	const { client_id, redirect_uris } = lichenOAuth(store).metadata;
	expect(redirect_uris).toEqual(["http://127.0.0.1:52741/callback"]);
	expect(new URL(String(client_id)).searchParams.get("scope")).toBe(
		"atproto include:wiki.lichen.permissions",
	);
});

test("a revoked session leaves the plugin's data", async () => {
	const { store, current } = savedSessions({ "did:plc:bob": session });
	const oauth = lichenOAuth(store);
	await expect(oauth.revoke("did:plc:bob")).rejects.toThrow();
	expect(current()).toEqual({});
});

test("the signed-in account is the session's DID", () => {
	expect(signedInDid({})).toBeUndefined();
	expect(signedInDid({ "did:plc:bob": session })).toBe("did:plc:bob");
});
