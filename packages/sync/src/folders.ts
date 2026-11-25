// A folder is vault-relative, without leading or trailing slashes; "" is the whole vault.

export function normalizeFolder(path: string): string {
	return path
		.trim()
		.replaceAll("\\", "/")
		.split("/")
		.map((part) => part.trim())
		.filter(Boolean)
		.join("/");
}

export function isWithin(path: string, folder: string): boolean {
	return folder === "" || path === folder || path.startsWith(`${folder}/`);
}

/** Where a wiki's conflict copies go: beside its folder, or in the vault's root for a whole-vault wiki, which leaves it out. */
export function conflictsFolder(folder: string): string {
	return folder ? `${folder} (conflicts)` : "Lichen conflicts";
}

/** Whether the markdown file at `path` is a note of the wiki synced into `folder`: any file in it or its subfolders. */
export function isNotePath(folder: string, path: string): boolean {
	return (
		path !== folder &&
		isWithin(path, folder) &&
		!isWithin(path, conflictsFolder(folder))
	);
}

/** The folder as a title. */
export function folderLabel(folder: string): string {
	return folder || "Whole vault";
}

/** The folder within a sentence. */
export function folderName(folder: string): string {
	return folder || "the whole vault";
}
