import { expect, test } from "bun:test";
import type { StoredSession, StoredState } from "@atcute/oauth-node-client";
import {
	callbackParams,
	lichenOAuth,
	type PendingSignIns,
	type Sessions,
	signedInDid,
	signInFailure,
} from "../../src/core/oauth.ts";
import type { Saved } from "../../src/core/saved.ts";

const session = {
	tokenSet: { sub: "did:plc:bob" },
} as unknown as StoredSession;

function signInExpiring(expiresAt: number): StoredState {
	return { expiresAt } as unknown as StoredState;
}

function saved<T>(initial: T): Saved<T> {
	let value = initial;
	return {
		get: () => value,
		save: async (next) => {
			value = next;
		},
	};
}

function oauthWith(sessions: Sessions = {}, signIns: PendingSignIns = {}) {
	const stores = { sessions: saved(sessions), signIns: saved(signIns) };
	return { oauth: lichenOAuth(stores), ...stores };
}

test("the client is the one lichen.wiki hosts, asking for Lichen's permission set", () => {
	const { client_id, redirect_uris, scope } = oauthWith().oauth.metadata;
	expect(client_id).toBe(
		"https://lichen.wiki/oauth/lichen-sync/client-metadata.json",
	);
	expect(redirect_uris).toEqual([
		"https://lichen.wiki/oauth/lichen-sync/callback",
	]);
	expect(scope).toBe("atproto include:wiki.lichen.permissions");
});

test("a saved sign-in answers its callback, once", async () => {
	const { oauth, signIns } = oauthWith(
		{},
		{ s: signInExpiring(Date.now() + 60_000) },
	);
	const denied = new URLSearchParams({ state: "s", error: "access_denied" });
	const err = await oauth.callback(denied).catch((e: unknown) => e);
	expect(signInFailure(err)).toBe("sign-in was cancelled.");
	expect(signIns.get()).toEqual({});
});

test("an expired sign-in answers no callback", async () => {
	const { oauth } = oauthWith({}, { s: signInExpiring(Date.now() - 1) });
	const params = new URLSearchParams({ state: "s", code: "c" });
	const err = await oauth.callback(params).catch((e: unknown) => e);
	expect(signInFailure(err)).toStartWith("that sign-in expired");
});

test("a callback's parameters leave out the obsidian:// action", () => {
	const params = callbackParams({
		action: "lichen-sync",
		code: "c",
		state: "s",
	});
	expect(Object.fromEntries(params)).toEqual({ code: "c", state: "s" });
});

test("a revoked session leaves the saved sessions", async () => {
	const { oauth, sessions } = oauthWith({ "did:plc:bob": session });
	await expect(oauth.revoke("did:plc:bob")).rejects.toThrow();
	expect(sessions.get()).toEqual({});
});

test("the signed-in account is the session's DID", () => {
	expect(signedInDid({})).toBeUndefined();
	expect(signedInDid({ "did:plc:bob": session })).toBe("did:plc:bob");
});
