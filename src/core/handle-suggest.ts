import { type Did, isDid } from "@atcute/lexicons/syntax";
import { BSKY_APPVIEW, bareActor } from "@lichen-wiki/sync/identity";
import { asRecord } from "@lichen-wiki/sync/json";

// The community index lichen.wiki suggests handles from, for the sign-in field: suggestions only, it still takes any handle.
// Mirrors lichen-repo/src/shared/handle-suggest.ts and avatar.ts until they move into @lichen-wiki/client.
const HANDLE_INDEX = "https://typeahead.waow.tech";
const ACTOR_LIMIT = 5;

export interface Actor {
	readonly did: Did;
	readonly handle: string;
	readonly displayName: string | null;
	readonly avatar: string | null;
}

/** Null when the value is too short to narrow the index, or already exact: a DID or a path. */
export function actorQuery(value: string): string | null {
	const query = bareActor(value);
	if (query.length < 2 || query.startsWith("did:") || query.includes("/")) {
		return null;
	}
	return query;
}

/** The host's JSON GET: Obsidian's requestUrl in the plugin. */
export type GetJson = (url: string) => Promise<unknown>;

export async function searchActors(
	getJson: GetJson,
	query: string,
): Promise<Actor[]> {
	const body = await getJson(
		`${HANDLE_INDEX}/xrpc/tech.waow.typeahead.searchActors?q=${encodeURIComponent(query)}&limit=${ACTOR_LIMIT}`,
	);
	return parseActors(asRecord(body)["actors"]).slice(0, ACTOR_LIMIT);
}

export async function getProfile(
	getJson: GetJson,
	did: Did,
): Promise<Actor | null> {
	const body = await getJson(
		`${BSKY_APPVIEW}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
	);
	return parseActors([body])[0] ?? null;
}

/**
 * Third-party actors: keeps those with a usable handle, and only avatars from Bluesky's CDN.
 * @internal
 */
export function parseActors(list: unknown): Actor[] {
	if (!Array.isArray(list)) return [];
	return list.flatMap((item: unknown): Actor[] => {
		const { did, handle, displayName, avatar } = asRecord(item);
		// Bluesky's sentinel for a handle that failed its own bidirectional check.
		if (
			typeof did !== "string" ||
			!isDid(did) ||
			typeof handle !== "string" ||
			!handle ||
			handle === "handle.invalid"
		) {
			return [];
		}
		return [
			{
				did,
				handle,
				displayName:
					typeof displayName === "string" && displayName.trim()
						? displayName
						: null,
				avatar: typeof avatar === "string" ? thumbnail(avatar) : null,
			},
		];
	});
}

// The ~150px variant: rows show avatars at 24px.
function thumbnail(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "https:" || parsed.hostname !== "cdn.bsky.app") {
			return null;
		}
	} catch {
		return null;
	}
	return url.replace("/img/avatar/", "/img/avatar_thumbnail/");
}
