/** The files the sync reads and writes, by vault-relative path. The host adapts its own. */
export interface Vault {
	/** Null when no file is at `path`. */
	read(path: string): Promise<string | null>;
	/** Creates the file, and its folders, when missing. */
	write(path: string, content: string): Promise<void>;
	/** The paths of the markdown files in `folder` ("" for the root) and its subfolders, none when it is missing. */
	list(folder: string): Promise<string[]>;
}
