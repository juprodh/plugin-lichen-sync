import type {} from "@atcute/atproto";
import { Client, ok, simpleFetchHandler } from "@atcute/client";
import {
	type Did,
	isDid,
	isHandle,
	type ResourceUri,
} from "@atcute/lexicons/syntax";
import { formatAtUri } from "@lichen/client/at-uri";
import { COLLECTIONS } from "@lichen/client/collections";

// Resolves handles with CORS headers, which a handle's own /.well-known/atproto-did often lacks, and serves profiles.
export const BSKY_APPVIEW = "https://public.api.bsky.app";

/** A handle or DID as typed: without the "@" or surrounding whitespace. */
export function bareActor(typed: string): string {
	return typed.trim().replace(/^@/, "");
}

/** The wiki's at-uri, from its owner's handle or DID as typed or linked: "@" and whitespace allowed. */
export async function resolveWiki(
	owner: string,
	wikiSlug: string,
): Promise<ResourceUri> {
	return formatAtUri(await resolveOwner(owner), COLLECTIONS.wiki, wikiSlug);
}

export async function resolveOwner(owner: string): Promise<Did> {
	const actor = bareActor(owner);
	if (isDid(actor)) return actor;
	if (!isHandle(actor)) throw new Error(`Not a handle or a DID: "${owner}"`);
	const resolver = new Client({
		handler: simpleFetchHandler({ service: BSKY_APPVIEW }),
	});
	const { did } = await ok(
		resolver.get("com.atproto.identity.resolveHandle", {
			params: { handle: actor },
		}),
	);
	if (!isDid(did)) throw new Error(`${actor} resolved to an invalid DID`);
	return did;
}
