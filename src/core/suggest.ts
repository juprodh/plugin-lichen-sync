import type { Client } from "@atcute/client";
import {
	type Did,
	isActorIdentifier,
	isDid,
	type ResourceUri,
} from "@atcute/lexicons/syntax";
import { getWiki, listWikis, searchWikis } from "./appview.ts";
import { HANDLE_RESOLVER, resolveWiki } from "./identity.ts";
import { asRecord } from "./json.ts";

// The community index lichen.wiki suggests handles from, for the sign-in field: suggestions only, it still takes any handle.
// Mirrors lichen-repo/src/shared/handle-suggest.ts and avatar.ts until they move into @lichen/client.
const HANDLE_INDEX = "https://typeahead.waow.tech";
const ACTOR_LIMIT = 5;
const SEARCH_LIMIT = 20;
const TIMEOUT_MS = 2000;

export interface Actor {
	readonly did: Did;
	readonly handle: string;
	readonly displayName: string | null;
	readonly avatar: string | null;
}

export interface WikiChoice {
	readonly uri: ResourceUri;
	readonly ownerDid: Did;
	/** For display; null when lichen.wiki never resolved it. */
	readonly ownerHandle: string | null;
	readonly slug: string;
	readonly name: string;
	readonly noteCount: number;
	/** The signed-in account's role on the wiki; null when it holds none, or nobody is signed in. */
	readonly role: string | null;
}

/** What the picker's search box names directly: a wiki, or an owner's wikis when the slug is still empty. */
export interface WikiRefQuery {
	readonly actor: string;
	readonly slug: string | null;
}

/** Null when the value is too short to narrow the index, or already exact: a DID or a path. */
export function actorQuery(value: string): string | null {
	const query = value.trim().replace(/^@/, "");
	if (query.length < 2 || query.startsWith("did:") || query.includes("/")) {
		return null;
	}
	return query;
}

/** A lichen.wiki link to a wiki or anything in it, or its path from `@`: `@alice.test/notes`, `@alice.test/`. */
export function parseWikiRef(text: string): WikiRefQuery | null {
	const path = text
		.trim()
		.replace(/^https?:\/\//, "")
		.replace(/^(?:www\.)?lichen\.wiki(?=\/)/, "");
	const [, actor, slug] = path.match(/^\/?@([^/\s]+)\/([^/?#\s]*)/) ?? [];
	if (!isActorIdentifier(actor)) return null;
	return { actor, slug: slug || null };
}

export async function searchActors(query: string): Promise<Actor[]> {
	const body = await getJson(
		`${HANDLE_INDEX}/xrpc/tech.waow.typeahead.searchActors?q=${encodeURIComponent(query)}&limit=${ACTOR_LIMIT}`,
	);
	return parseActors(body["actors"]).slice(0, ACTOR_LIMIT);
}

export async function getProfile(did: Did): Promise<Actor | null> {
	return (await getProfiles([did])).get(did) ?? null;
}

/** Every wiki the account holds a role on, its own and others'. */
export async function yourWikis(
	appview: Client,
	account: Did,
): Promise<WikiChoice[]> {
	const views = await listWikis(appview, account);
	return views.map((view) => choice(view, view.role));
}

/** lichen.wiki's search, with the signed-in account's role from `yours`. */
export async function findWikis(
	appview: Client,
	query: string,
	yours: readonly WikiChoice[],
): Promise<WikiChoice[]> {
	const views = await searchWikis(
		appview,
		query.trim().replace(/^@/, ""),
		SEARCH_LIMIT,
	);
	return views.map((view) => choice(view, roleIn(yours, view.uri)));
}

/** The wikis `did` holds a role on, with the signed-in account's role from `yours`. */
export async function wikisOf(
	appview: Client,
	did: Did,
	yours: readonly WikiChoice[],
): Promise<WikiChoice[]> {
	const views = await listWikis(appview, did);
	return views.map((view) => choice(view, roleIn(yours, view.uri)));
}

/** Null when the owner has no such public wiki. */
export async function wikiAt(
	appview: Client,
	actor: string,
	slug: string,
	account: Did | undefined,
): Promise<WikiChoice | null> {
	const view = await getWiki(appview, await resolveWiki(actor, slug), account);
	if (!view) return null;
	return choice(
		{ ...view, ownerHandle: isDid(actor) ? undefined : actor },
		view.viewer?.role ?? null,
	);
}

export function matchWikis(
	choices: readonly WikiChoice[],
	query: string,
): WikiChoice[] {
	const needle = query.trim().replace(/^@/, "").toLowerCase();
	return choices.filter((wiki) =>
		[wiki.name, wiki.slug, wiki.ownerHandle ?? ""].some((field) =>
			field.toLowerCase().includes(needle),
		),
	);
}

/** `first`, then the wikis of `rest` it does not already hold. */
export function mergeWikis(
	first: readonly WikiChoice[],
	rest: readonly WikiChoice[],
): WikiChoice[] {
	const seen = new Set(first.map((wiki) => wiki.uri));
	return [...first, ...rest.filter((wiki) => !seen.has(wiki.uri))];
}

interface ListedWiki {
	readonly uri: ResourceUri;
	readonly did: Did;
	readonly ownerHandle?: string | undefined;
	readonly slug: string;
	readonly name: string;
	readonly noteCount: number;
}

function choice(wiki: ListedWiki, role: string | null): WikiChoice {
	return {
		uri: wiki.uri,
		ownerDid: wiki.did,
		ownerHandle: wiki.ownerHandle ?? null,
		slug: wiki.slug,
		name: wiki.name,
		noteCount: wiki.noteCount,
		role,
	};
}

function roleIn(yours: readonly WikiChoice[], uri: ResourceUri): string | null {
	return yours.find((wiki) => wiki.uri === uri)?.role ?? null;
}

// getProfiles takes at most 25 actors.
async function getProfiles(dids: Did[]): Promise<Map<Did, Actor>> {
	if (dids.length === 0) return new Map();
	const params = dids
		.slice(0, 25)
		.map((did) => `actors=${encodeURIComponent(did)}`)
		.join("&");
	const body = await getJson(
		`${HANDLE_RESOLVER}/xrpc/app.bsky.actor.getProfiles?${params}`,
	);
	return new Map(
		parseActors(body["profiles"]).map((actor) => [actor.did, actor]),
	);
}

async function getJson(url: string): Promise<Record<string, unknown>> {
	const res = await fetch(url, {
		signal: AbortSignal.timeout(TIMEOUT_MS),
		headers: { "X-Client": "lichen-sync" },
	});
	return res.ok ? asRecord(await res.json()) : {};
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
