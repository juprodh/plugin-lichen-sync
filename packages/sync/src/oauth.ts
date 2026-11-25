import {
	CompositeDidDocumentResolver,
	LocalActorResolver,
	PlcDidDocumentResolver,
	WebDidDocumentResolver,
	XrpcHandleResolver,
} from "@atcute/identity-resolver";
import { type Did, isDid } from "@atcute/lexicons/syntax";
import {
	OAuthCallbackError,
	OAuthClient,
	type Store,
	type StoredSession,
	type StoredState,
} from "@atcute/oauth-node-client";
import { syncPluginClientMetadata } from "@lichen-wiki/client/sync-plugin-oauth";
import { LICHEN_ORIGIN } from "./appview.ts";
import { BSKY_APPVIEW } from "./identity.ts";
import { asRecord } from "./json.ts";
import type { Saved } from "./saved.ts";

/** OAuth sessions keyed by DID: tokens and the DPoP key, as the OAuth client stores them. */
export type Sessions = Readonly<Record<Did, StoredSession>>;

/** Sign-ins waiting on the browser, keyed by their OAuth `state`. */
export type PendingSignIns = Readonly<Record<string, StoredState>>;

/** The OAuth client lichen.wiki hosts for the plugin, its sessions and sign-ins kept where the host saves them. */
export function lichenOAuth(stores: {
	sessions: Saved<Sessions>;
	signIns: Saved<PendingSignIns>;
}): OAuthClient {
	return new OAuthClient({
		metadata: syncPluginClientMetadata(LICHEN_ORIGIN),
		actorResolver: new LocalActorResolver({
			handleResolver: new XrpcHandleResolver({ serviceUrl: BSKY_APPVIEW }),
			didDocumentResolver: new CompositeDidDocumentResolver({
				methods: {
					plc: new PlcDidDocumentResolver(),
					web: new WebDidDocumentResolver(),
				},
			}),
		}),
		stores: {
			sessions: sessionStore(stores.sessions),
			states: signInStore(stores.signIns),
		},
	});
}

function sessionStore(sessions: Saved<Sessions>): Store<Did, StoredSession> {
	return {
		get: (did) => sessions.get()[did],
		set: (did, session) => sessions.save({ ...sessions.get(), [did]: session }),
		delete: (did) => {
			const { [did]: _, ...rest } = sessions.get();
			return sessions.save(rest);
		},
		clear: () => sessions.save({}),
	};
}

// Saved rather than in memory, since a phone may close Obsidian while the browser is open.
function signInStore(
	signIns: Saved<PendingSignIns>,
): Store<string, StoredState> {
	return {
		get: (id) => {
			const state = signIns.get()[id];
			return state && state.expiresAt > Date.now() ? state : undefined;
		},
		// One sign-in at a time: a new one replaces any still waiting.
		set: (id, state) => signIns.save({ [id]: state }),
		delete: (id) => {
			const { [id]: _, ...rest } = signIns.get();
			return signIns.save(rest);
		},
		clear: () => signIns.save({}),
	};
}

/** The signed-in account: the plugin keeps one session at a time. */
export function signedInDid(sessions: Sessions): Did | undefined {
	return Object.keys(sessions).find(isDid);
}

// A malformed session fails when restored, and signing in again replaces it.
export function parseSessions(data: unknown): Sessions {
	const sessions: Record<Did, StoredSession> = {};
	for (const [did, session] of Object.entries(asRecord(data))) {
		if (isDid(did) && typeof session === "object" && session !== null) {
			sessions[did] = session as StoredSession;
		}
	}
	return sessions;
}

// A malformed sign-in fails its callback, and signing in again replaces it.
export function parsePendingSignIns(data: unknown): PendingSignIns {
	const signIns: Record<string, StoredState> = {};
	for (const [id, state] of Object.entries(asRecord(data))) {
		if (typeof asRecord(state)["expiresAt"] === "number") {
			signIns[id] = state as StoredState;
		}
	}
	return signIns;
}

/** The authorization response in an `obsidian://` URL's parameters, which also name the action. */
export function callbackParams(
	data: Readonly<Record<string, string>>,
): URLSearchParams {
	const { action: _, ...params } = data;
	return new URLSearchParams(params);
}

/** What the user reads when a sign-in fails, after "Lichen Sync: ". */
export function signInFailure(err: unknown): string {
	if (err instanceof OAuthCallbackError) {
		if (err.error === "access_denied") return "sign-in was cancelled.";
		// atcute reports an unknown state only through its description.
		if (err.errorDescription === "unknown state") {
			return "that sign-in expired, was replaced by a newer one, or was started in another vault. Sign in again.";
		}
	}
	return `sign-in failed. ${err instanceof Error ? err.message : String(err)}`;
}
