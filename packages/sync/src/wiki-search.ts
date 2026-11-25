import type {} from "@atcute/atproto";
import { type Client, ok } from "@atcute/client";
import {
	type Did,
	isActorIdentifier,
	isDid,
	type ResourceUri,
} from "@atcute/lexicons/syntax";
import { parseAtUri } from "@lichen-wiki/client/at-uri";
import { COLLECTIONS } from "@lichen-wiki/client/collections";
import { getWiki, listWikis, searchWikis } from "./appview.ts";
import { bareActor, resolveWiki } from "./identity.ts";

const SEARCH_LIMIT = 20;

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
	const views = await searchWikis(appview, bareActor(query), SEARCH_LIMIT);
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

/** The public wikis `account` bookmarked, from the bookmarks on its PDS, which other apps share. */
export async function bookmarkedWikis(
	appview: Client,
	pds: Client,
	account: Did,
): Promise<WikiChoice[]> {
	const wikis = new Map<string, WikiChoice>();
	let cursor: string | undefined;
	do {
		const page = await ok(
			pds.get("com.atproto.repo.listRecords", {
				params: {
					repo: account,
					collection: COLLECTIONS.bookmark,
					limit: 100,
					...(cursor ? { cursor } : {}),
				},
			}),
		);
		const subjects = new Set<ResourceUri>();
		for (const { value } of page.records) {
			const subject = value["subject"];
			if (typeof subject !== "string" || wikis.has(subject)) continue;
			if (parseAtUri(subject)?.collection !== COLLECTIONS.wiki) continue;
			subjects.add(subject as ResourceUri);
		}
		// One page at a time, so a long bookmark list asks lichen.wiki at most a page's worth at once.
		const found = await Promise.all(
			[...subjects].map(
				async (subject) =>
					[subject, await getWiki(appview, subject, account)] as const,
			),
		);
		for (const [subject, view] of found) {
			if (view) wikis.set(subject, choice(view, view.viewer?.role ?? null));
		}
		cursor = page.cursor;
	} while (cursor);
	return [...wikis.values()];
}

export function matchWikis(
	choices: readonly WikiChoice[],
	query: string,
): WikiChoice[] {
	const needle = bareActor(query).toLowerCase();
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
