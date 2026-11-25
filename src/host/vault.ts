import { isNotePath, isWithin } from "@lichen-wiki/sync/folders";
import type { Vault } from "@lichen-wiki/sync/vault";
import { type App, normalizePath } from "obsidian";

export function hostVault(app: App): Vault {
	return {
		async read(path) {
			const file = app.vault.getFileByPath(normalizePath(path));
			return file ? app.vault.read(file) : null;
		},
		async write(path, content) {
			const normalized = normalizePath(path);
			const file = app.vault.getFileByPath(normalized);
			if (file) return app.vault.modify(file, content);
			const folder = normalized.split("/").slice(0, -1).join("/");
			if (folder && !app.vault.getFolderByPath(folder)) {
				await app.vault.createFolder(folder);
			}
			await app.vault.create(normalized, content);
		},
		async remove(path) {
			const file = app.vault.getFileByPath(normalizePath(path));
			// The user's choice of trash: Obsidian's, the system's, or none.
			if (file) await app.fileManager.trashFile(file);
		},
		async list(folder) {
			const root = folder ? normalizePath(folder) : "";
			return app.vault
				.getMarkdownFiles()
				.map((file) => file.path)
				.filter((path) => isWithin(path, root));
		},
	};
}

/** The notes of a wiki synced into `folder`, as the vault holds them now. */
export function notePaths(app: App, folder: string): string[] {
	return app.vault
		.getMarkdownFiles()
		.map((file) => file.path)
		.filter((path) => isNotePath(folder, path));
}
