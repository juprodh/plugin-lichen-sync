import { normalizeLineEndings } from "@lichen-wiki/client/text";

/** The files the sync reads and writes, by vault-relative path. The host adapts its own. */
export interface Vault {
	/** Null when no file is at `path`. */
	read(path: string): Promise<string | null>;
	/** Creates the file, and its folders, when missing. */
	write(path: string, content: string): Promise<void>;
	/** The paths of the markdown files in `folder` ("" for the root) and its subfolders, none when it is missing. */
	list(folder: string): Promise<string[]>;
	/** Removes the file at `path`, to the host's trash where it has one. */
	remove(path: string): Promise<void>;
}

/** A note's text as lichen.wiki stores it, with the line endings its editor and import write; null when no file is at `path`. */
export async function readNote(
	vault: Vault,
	path: string,
): Promise<string | null> {
	const text = await vault.read(path);
	return text === null ? null : normalizeLineEndings(text);
}
