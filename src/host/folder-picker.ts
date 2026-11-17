import { type App, SuggestModal } from "obsidian";
import { folderLabel, normalizeFolder } from "../core/folders.ts";
import { plural } from "../core/plural.ts";
import { renderRow } from "./suggestion-row.ts";
import { notePaths } from "./vault.ts";

interface FolderItem {
	/** "" for the whole vault. */
	readonly path: string;
	/** Markdown files in it and its subfolders; null for a folder to create. */
	readonly notes: number | null;
}

interface FolderPickerOptions {
	readonly placeholder: string;
	readonly initial: string;
	/** A move needs a new path; adding a wiki can take an existing folder. */
	readonly allowExisting: boolean;
	/** Why a folder cannot be picked, or null. */
	problem(folder: string): string | null;
	onPick(folder: string): void;
}

const FOLDER_LIMIT = 8;

export class FolderPickerModal extends SuggestModal<FolderItem> {
	constructor(
		app: App,
		private readonly options: FolderPickerOptions,
	) {
		super(app);
		this.setPlaceholder(options.placeholder);
		this.setInstructions([
			{ command: "↵", purpose: "to choose" },
			{ command: "esc", purpose: "to cancel" },
		]);
	}

	override onOpen(): void {
		super.onOpen();
		this.inputEl.value = this.options.initial;
		this.inputEl.select();
		this.inputEl.dispatchEvent(new Event("input"));
	}

	override getSuggestions(query: string): FolderItem[] {
		const typed = normalizeFolder(query);
		const typedExists = this.app.vault.getFolderByPath(typed) !== null;
		const items: FolderItem[] = [];
		if (typed && !typedExists && !this.options.problem(typed)) {
			items.push({ path: typed, notes: null });
		}
		if (this.options.allowExisting && !this.options.problem("")) {
			items.push({ path: "", notes: notePaths(this.app, "").length });
		}
		if (this.options.allowExisting) {
			const needle = typed.toLowerCase();
			const existing = this.app.vault
				.getAllFolders(false)
				.filter(
					(folder) =>
						folder.path.toLowerCase().includes(needle) &&
						!this.options.problem(folder.path),
				)
				// The typed path first, then the shortest: the likeliest picks.
				.sort(
					(a, b) =>
						Number(b.path === typed) - Number(a.path === typed) ||
						a.path.length - b.path.length,
				)
				.slice(0, FOLDER_LIMIT);
			items.push(
				...existing.map((folder) => ({
					path: folder.path,
					notes: notePaths(this.app, folder.path).length,
				})),
			);
		}
		this.emptyStateText =
			(typed && this.options.problem(typed)) ||
			(typedExists ? "That folder exists already: type a new path." : "") ||
			"Type a folder path.";
		return items;
	}

	override renderSuggestion(item: FolderItem, el: HTMLElement): void {
		renderRow(el, {
			avatar: null,
			title: folderLabel(item.path),
			note: folderNote(item),
		});
	}

	override onChooseSuggestion(item: FolderItem): void {
		this.options.onPick(item.path);
	}
}

function folderNote({ path, notes }: FolderItem): string {
	if (notes === null) return "New folder";
	const joining = `its ${notes} ${plural("note", notes)} join the wiki at your next sync, if you can edit it`;
	if (!path) return `Your vault as this wiki, and no other: ${joining}`;
	return notes === 0
		? "Existing folder, no notes in it"
		: `Existing folder: ${joining}`;
}
