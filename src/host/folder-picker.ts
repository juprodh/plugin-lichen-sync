import { type App, SuggestModal, TFile, type TFolder } from "obsidian";
import { normalizeFolder } from "../core/settings.ts";
import { renderRow } from "./suggest.ts";

interface FolderItem {
	readonly path: string;
	/** Markdown files directly in it; null for a folder to create. */
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

const LIMIT = 8;

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
				.slice(0, LIMIT);
			items.push(
				...existing.map((folder) => ({
					path: folder.path,
					notes: markdownFiles(folder),
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
			title: item.path,
			note:
				item.notes === null
					? "New folder"
					: item.notes === 0
						? "Existing folder, no notes in it"
						: `Existing folder: its ${item.notes} note${item.notes === 1 ? "" : "s"} join the wiki at your next sync, if you can edit it`,
		});
	}

	override onChooseSuggestion(item: FolderItem): void {
		this.options.onPick(item.path);
	}
}

function markdownFiles(folder: TFolder): number {
	return folder.children.filter(
		(file) => file instanceof TFile && file.extension === "md",
	).length;
}
