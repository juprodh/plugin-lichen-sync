import { isResourceUri, type ResourceUri } from "@atcute/lexicons/syntax";
import { parseAtUri } from "@lichen/client/at-uri";
import { conflictsFolder } from "./filenames.ts";
import { asRecord, stringField } from "./json.ts";

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

export function isWithin(path: string, folder: string): boolean {
	return folder === "" || path === folder || path.startsWith(`${folder}/`);
}

/** Whether the markdown file at `path` is a note of the wiki synced into `folder`: any file in it or its subfolders. */
export function isNotePath(folder: string, path: string): boolean {
	return (
		path !== folder &&
		isWithin(path, folder) &&
		!isWithin(path, conflictsFolder(folder))
	);
}

export function folderLabel(folder: string): string {
	return folder || "Whole vault";
}
