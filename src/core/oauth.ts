import {
	CompositeDidDocumentResolver,
	LocalActorResolver,
	PlcDidDocumentResolver,
	WebDidDocumentResolver,
	XrpcHandleResolver,
} from "@atcute/identity-resolver";
import { type Did, isDid } from "@atcute/lexicons/syntax";
import {
	MemoryStore,
	OAuthClient,
	type Store,
	type StoredSession,
	type StoredState,
} from "@atcute/oauth-node-client";
import { BSKY_APPVIEW } from "./identity.ts";
import { asRecord } from "./json.ts";

// Fixed, since a loopback client's id embeds its redirect URI and a token refresh must present the same id.
export const LOOPBACK_PORT = 52741;
export const LOOPBACK_CALLBACK_PATH = "/callback";
const REDIRECT_URI = `http://127.0.0.1:${LOOPBACK_PORT}${LOOPBACK_CALLBACK_PATH}`;

// The records the plugin writes; the PDS expands the set to their collections.
const SCOPE = "atproto include:wiki.lichen.permissions";

const SIGN_IN_TTL_MS = 10 * 60_000;

/** OAuth sessions keyed by DID: tokens and the DPoP key, as the OAuth client stores them. */
export type Sessions = Readonly<Record<Did, StoredSession>>;

interface SessionsStore {
	get(): Sessions;
	save(sessions: Sessions): Promise<void>;
}

/** The OAuth client, its sessions kept wherever `sessions` saves them. */
export function lichenOAuth(sessions: SessionsStore): OAuthClient {
	return new OAuthClient({
		metadata: { redirect_uris: [REDIRECT_URI], scope: SCOPE },
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
			sessions: sessionStore(sessions),
			states: new MemoryStore<string, StoredState>({
				maxSize: 10,
				ttl: SIGN_IN_TTL_MS,
				ttlAutopurge: true,
			}),
		},
	});
}

function sessionStore(sessions: SessionsStore): Store<Did, StoredSession> {
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
