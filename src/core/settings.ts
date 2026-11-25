import { isResourceUri, type ResourceUri } from "@atcute/lexicons/syntax";
import { parseAtUri } from "@lichen-wiki/client/at-uri";
import { isWithin, normalizeFolder } from "@lichen-wiki/sync/folders";
import { asRecord, stringField } from "@lichen-wiki/sync/json";

/** A wiki kept in sync with one vault folder. */
export interface SyncedWiki {
	readonly uri: ResourceUri;
	/** Vault-relative, without leading or trailing slashes; "" is the whole vault. */
	readonly folder: string;
	/** The name and owner handle when added, for display: lichen.wiki holds the current ones. */
	readonly name: string;
	readonly ownerHandle: string;
	/** ISO time of the last pull, "" before the first. */
	readonly pulledAt: string;
}

export interface Settings {
	/** The handle or DID last used to sign in. */
	readonly account: string;
	readonly wikis: readonly SyncedWiki[];
}

export function parseSettings(data: unknown): Settings {
	const raw = asRecord(data);
	const wikis = Array.isArray(raw["wikis"]) ? raw["wikis"] : [];
	return {
		account: stringField(raw, "account"),
		wikis: wikis.flatMap((item: unknown): SyncedWiki[] => {
			const wiki = asRecord(item);
			const uri = stringField(wiki, "uri");
			if (!isResourceUri(uri) || typeof wiki["folder"] !== "string") return [];
			return [
				{
					uri,
					folder: normalizeFolder(wiki["folder"]),
					name: stringField(wiki, "name"),
					ownerHandle: stringField(wiki, "ownerHandle"),
					pulledAt: stringField(wiki, "pulledAt"),
				},
			];
		}),
	};
}

export function wikiSlug(wiki: SyncedWiki): string {
	return parseAtUri(wiki.uri)?.rkey ?? "";
}

export function findWiki(
	wikis: readonly SyncedWiki[],
	uri: string,
): SyncedWiki | undefined {
	return wikis.find((wiki) => wiki.uri === uri);
}

/** The wiki's name, or its reference when it has none. */
export function wikiLabel(wiki: SyncedWiki): string {
	return wiki.name || wikiRef(wiki);
}

/** As lichen.wiki's URLs name it: `@handle/slug`, or the owner's DID when the handle is unknown. */
export function wikiRef(wiki: SyncedWiki): string {
	const owner = wiki.ownerHandle || parseAtUri(wiki.uri)?.repo || "";
	return `@${owner}/${wikiSlug(wiki)}`;
}

/** The synced wiki whose folder holds `folder` or sits inside it: a file is one wiki's note at most. */
export function folderClash(
	folder: string,
	wikis: readonly SyncedWiki[],
	except?: ResourceUri,
): SyncedWiki | undefined {
	return wikis.find(
		(wiki) =>
			wiki.uri !== except &&
			(isWithin(folder, wiki.folder) || isWithin(wiki.folder, folder)),
	);
}

/** The wikis with folders at or under `from` moved to `to`. */
export function followFolderRename(
	wikis: readonly SyncedWiki[],
	from: string,
	to: string,
): readonly SyncedWiki[] {
	return wikis.map((wiki) =>
		isWithin(wiki.folder, from)
			? { ...wiki, folder: to + wiki.folder.slice(from.length) }
			: wiki,
	);
}
