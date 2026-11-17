import { isResourceUri, type ResourceUri } from "@atcute/lexicons/syntax";
import { parseAtUri } from "@lichen/client/at-uri";
import { asRecord, stringField } from "./json.ts";

/** A wiki kept in sync with one vault folder. */
export interface SyncedWiki {
	readonly uri: ResourceUri;
	/** Vault-relative, without leading or trailing slashes. */
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
			const folder = normalizeFolder(stringField(wiki, "folder"));
			if (!isResourceUri(uri) || !folder) return [];
			return [
				{
					uri,
					folder,
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

/** As lichen.wiki's URLs name it: `@handle/slug`, or the owner's DID when the handle is unknown. */
export function wikiRef(wiki: SyncedWiki): string {
	const owner = wiki.ownerHandle || parseAtUri(wiki.uri)?.repo || "";
	return `@${owner}/${wikiSlug(wiki)}`;
}

export function normalizeFolder(path: string): string {
	return path
		.trim()
		.replaceAll("\\", "/")
		.split("/")
		.map((part) => part.trim())
		.filter(Boolean)
		.join("/");
}

/** The synced wiki whose folder holds `folder` or sits inside it: every markdown file directly in a folder is one wiki's note. */
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

export function isWithin(path: string, folder: string): boolean {
	return path === folder || path.startsWith(`${folder}/`);
}
