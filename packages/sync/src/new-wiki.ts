import type { Client } from "@atcute/client";
import type { Did, ResourceUri } from "@atcute/lexicons/syntax";
import { formatAtUri } from "@lichen-wiki/client/at-uri";
import { type CheckProblem, checkNewWiki } from "@lichen-wiki/client/check";
import { COLLECTIONS } from "@lichen-wiki/client/collections";
import { WikiLichenWiki } from "@lichen-wiki/client/lexicons/index";
import { getRecordValue } from "@lichen-wiki/client/pds-read";
import { applyCreates } from "@lichen-wiki/client/pds-write";
import { newWikiWrites } from "@lichen-wiki/client/writes";
import { getWiki } from "./appview.ts";
import { pollUntil, type WaitOptions } from "./wait.ts";
import type { WikiChoice } from "./wiki-search.ts";

export interface NewWikiFields {
	readonly name: string;
	/** "" takes the address from the name. */
	readonly slug: string;
	readonly language: string;
}

export interface WikiOwner {
	readonly did: Did;
	readonly handle: string | null;
}

export type NewWikiProblem =
	| CheckProblem
	| { code: "wikiSlugExists"; slug: string };

export type NewWikiOutcome =
	| { readonly problem: NewWikiProblem }
	/** `seen` is false when lichen.wiki had not taken the wiki in when the wait ended. */
	| { readonly wiki: WikiChoice; readonly seen: boolean };

/**
 * Publishes a public wiki and its owner's grant in one commit, as lichen.wiki's
 * own form does, then waits until lichen.wiki lets the owner write to it.
 */
export async function createWiki(
	appview: Client,
	pds: Client,
	owner: WikiOwner,
	fields: NewWikiFields,
	wait: WaitOptions,
): Promise<NewWikiOutcome> {
	const checked = checkNewWiki(fields);
	if ("problem" in checked) return { problem: checked.problem };
	const { slug } = checked;
	if (await isWikiSlugTaken(appview, pds, owner.did, slug)) {
		return { problem: { code: "wikiSlugExists", slug } };
	}

	const writes = newWikiWrites(owner.did, slug, {
		name: fields.name,
		visibility: "public",
		language: fields.language,
		createdAt: new Date().toISOString(),
	});
	await applyCreates(pds, [writes.wiki, writes.grant]);

	const viewer = await waitForWiki(appview, writes.wiki.uri, owner.did, wait);
	return {
		wiki: {
			uri: writes.wiki.uri,
			ownerDid: owner.did,
			ownerHandle: owner.handle,
			slug,
			name: fields.name,
			noteCount: 0,
			role: viewer?.role ?? null,
		},
		seen: viewer !== null,
	};
}

// The owner's repo is the authority on its rkeys; lichen.wiki may still hold a wiki whose record went.
async function isWikiSlugTaken(
	appview: Client,
	pds: Client,
	did: Did,
	slug: string,
): Promise<boolean> {
	const target = { repo: did, collection: COLLECTIONS.wiki, rkey: slug };
	const [record, view] = await Promise.all([
		getRecordValue(pds, target, WikiLichenWiki.mainSchema),
		getWiki(appview, formatAtUri(did, COLLECTIONS.wiki, slug)),
	]);
	return record !== null || view !== null;
}

/** What lichen.wiki says of the owner once they can write to the wiki, or null when the wait ended first. */
function waitForWiki(
	appview: Client,
	uri: ResourceUri,
	owner: Did,
	wait: WaitOptions,
): Promise<{ role?: string | undefined } | null> {
	return pollUntil(wait, async () => {
		const viewer = (await getWiki(appview, uri, owner))?.viewer;
		return viewer?.canWrite ? viewer : null;
	});
}
