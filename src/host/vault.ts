import { type App, normalizePath, TFile, TFolder } from "obsidian";
import type { Vault } from "../core/vault.ts";

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
		async list(folder) {
			const paths: string[] = [];
			const walk = (dir: TFolder) => {
				for (const file of dir.children) {
					if (file instanceof TFile && file.extension === "md") {
						paths.push(file.path);
					} else if (file instanceof TFolder) {
						walk(file);
					}
				}
			};
			const root = folder
				? app.vault.getFolderByPath(normalizePath(folder))
				: app.vault.getRoot();
			if (root) walk(root);
			return paths;
		},
	};
}
