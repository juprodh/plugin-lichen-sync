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

// Answers with CORS headers, which a handle's own /.well-known/atproto-did often lacks.
const HANDLE_RESOLVER = "https://public.api.bsky.app";

/** The wiki's at-uri, from its owner's handle or DID as typed in settings: "@" and whitespace allowed. */
export async function resolveWiki(
	owner: string,
	wikiSlug: string,
): Promise<ResourceUri> {
	return formatAtUri(await resolveOwner(owner), COLLECTIONS.wiki, wikiSlug);
}

async function resolveOwner(owner: string): Promise<Did> {
	const actor = owner.trim().replace(/^@/, "");
	if (isDid(actor)) return actor;
	if (!isHandle(actor)) throw new Error(`Not a handle or a DID: "${owner}"`);
	const resolver = new Client({
		handler: simpleFetchHandler({ service: HANDLE_RESOLVER }),
	});
	const { did } = await ok(
		resolver.get("com.atproto.identity.resolveHandle", {
			params: { handle: actor },
		}),
	);
	if (!isDid(did)) throw new Error(`${actor} resolved to an invalid DID`);
	return did;
}
