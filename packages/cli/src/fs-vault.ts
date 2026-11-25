import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Vault } from "@lichen-wiki/sync/vault";
import { isMissing } from "./json-file.ts";

/** The markdown files under `root`, by `/`-separated path; hidden files and folders, as `.lichen` and `.git`, are none of the wiki's. */
export function folderVault(root: string): Vault {
	return {
		async read(path) {
			try {
				return await readFile(join(root, path), "utf8");
			} catch (err) {
				if (isMissing(err)) return null;
				throw err;
			}
		},
		async write(path, content) {
			const file = join(root, path);
			await mkdir(dirname(file), { recursive: true });
			await writeFile(file, content);
		},
		list: (folder) => markdownFiles(root, folder),
		// No trash to reach from Node: lichen.wiki keeps the deleted note's history.
		remove: (path) => rm(join(root, path), { force: true }),
	};
}

async function markdownFiles(root: string, folder: string): Promise<string[]> {
	let entries: Dirent[];
	try {
		entries = await readdir(join(root, folder), { withFileTypes: true });
	} catch (err) {
		if (isMissing(err)) return [];
		throw err;
	}
	const paths: string[] = [];
	for (const entry of entries) {
		if (entry.name.startsWith(".")) continue;
		const path = folder ? `${folder}/${entry.name}` : entry.name;
		if (entry.isDirectory()) paths.push(...(await markdownFiles(root, path)));
		else if (entry.isFile() && entry.name.endsWith(".md")) paths.push(path);
	}
	return paths;
}
