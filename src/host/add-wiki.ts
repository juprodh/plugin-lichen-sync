import type { Client } from "@atcute/client";
import type { Did } from "@atcute/lexicons/syntax";
import { type App, Notice } from "obsidian";
import { canWrite } from "../core/appview.ts";
import { folderName } from "../core/folders.ts";
import { plural } from "../core/plural.ts";
import {
	findWiki,
	folderClash,
	type Settings,
	type SyncedWiki,
	wikiLabel,
} from "../core/settings.ts";
import type { WikiChoice } from "../core/wiki-search.ts";
import { confirm } from "./confirm.ts";
import { FolderPickerModal } from "./folder-picker.ts";
import { notePaths } from "./vault.ts";
import { WikiPickerModal } from "./wiki-picker.ts";

/** What adding a wiki asks of the plugin, which owns data.json. */
export interface AddWikiHost {
	readonly appview: Client;
	settings(): Settings;
	signedIn(): Did | undefined;
	signIn(account: string): Promise<void>;
	/** Saves the wiki and syncs it at once. */
	addWiki(wiki: WikiChoice, folder: string): Promise<void>;
}

/** The wiki picker, then the folder picker; `onChange` runs once the settings changed. */
export function openAddWiki(
	app: App,
	host: AddWikiHost,
	onChange: () => void,
): void {
	new WikiPickerModal(app, {
		appview: host.appview,
		account: host.signedIn(),
		syncedFolder: (uri) => findWiki(host.settings().wikis, uri)?.folder,
		onSignIn: async (handle) => {
			await host.signIn(handle);
			onChange();
			// Back to the picker, now listing your wikis.
			if (host.signedIn()) openAddWiki(app, host, onChange);
		},
		onPick: (choice) => pickFolder(app, host, choice, onChange),
	}).open();
}

function pickFolder(
	app: App,
	host: AddWikiHost,
	choice: WikiChoice,
	onChange: () => void,
): void {
	const { wikis } = host.settings();
	const synced = findWiki(wikis, choice.uri);
	if (synced) {
		new Notice(
			`Lichen Sync: ${choice.name} already syncs into ${folderName(synced.folder)}.`,
		);
		return;
	}
	new FolderPickerModal(app, {
		placeholder: `Folder for ${choice.name}`,
		initial: choice.slug,
		allowExisting: true,
		problem: (folder) => clashProblem(folderClash(folder, wikis)),
		onPick: async (folder) => {
			if (!(await confirmSending(app, host, choice, folder))) return;
			await host.addWiki(choice, folder);
			onChange();
		},
	}).open();
}

// The first sync sends the folder's notes the wiki lacks as new notes, which is hard to take back.
async function confirmSending(
	app: App,
	host: AddWikiHost,
	choice: WikiChoice,
	folder: string,
): Promise<boolean> {
	const count = notePaths(app, folder).length;
	const account = host.signedIn();
	if (count === 0 || !account) return true;
	// Unsure whether the account can write, it asks anyway.
	const writes = await canWrite(host.appview, choice.uri, account).catch(
		() => true,
	);
	if (!writes) return true;
	const notes = `${count} ${plural("note", count)}`;
	return confirm(app, {
		title: `Send ${notes} to “${choice.name}”?`,
		message: `${folder || "Your vault"} already holds ${notes}. Adding ${choice.name} sends those it lacks to lichen.wiki now, as new notes under your account.`,
		action: "Add and send",
	});
}

export function clashProblem(clash: SyncedWiki | undefined): string | null {
	return clash
		? `${wikiLabel(clash)} already syncs into ${folderName(clash.folder)}; wiki folders cannot nest.`
		: null;
}
