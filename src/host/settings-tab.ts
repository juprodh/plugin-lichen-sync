import type { ResourceUri } from "@atcute/lexicons/syntax";
import {
	type App,
	Notice,
	type Plugin,
	PluginSettingTab,
	type Setting,
	type SettingDefinitionItem,
	type SettingDefinitionPage,
	TFile,
} from "obsidian";
import { getWiki } from "../core/appview.ts";
import { conflictsFolder, folderLabel, isWithin } from "../core/folders.ts";
import {
	findWiki,
	folderClash,
	type SyncedWiki,
	wikiLabel,
	wikiRef,
	wikiSlug,
} from "../core/settings.ts";
import { type AddWikiHost, clashProblem, openAddWiki } from "./add-wiki.ts";
import { confirm } from "./confirm.ts";
import { FolderPickerModal } from "./folder-picker.ts";
import { ActorSuggest, findProfile } from "./handle-suggest.ts";

/** What the tab asks of the plugin, which owns data.json. */
interface SettingsHost extends AddWikiHost {
	signOut(): Promise<void>;
	removeWiki(uri: ResourceUri): Promise<void>;
	moveWiki(uri: ResourceUri, folder: string): Promise<void>;
	syncWiki(uri: ResourceUri): Promise<void>;
	syncing(): boolean;
}

export class SettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: Plugin,
		private readonly host: SettingsHost,
	) {
		super(app, plugin);
	}

	override getSettingDefinitions(): SettingDefinitionItem[] {
		const { wikis } = this.host.settings();
		return [
			{
				type: "group",
				heading: "Account",
				cls: "lichen-sync-account-group",
				items: [
					{ name: "Account", render: (setting) => this.renderAccount(setting) },
				],
			},
			{
				type: "list",
				heading: "Wikis",
				cls: "lichen-sync-wikis",
				emptyState: "No wikis yet. Add one to sync its notes into a folder.",
				addItem: {
					name: "Add wiki",
					action: () => openAddWiki(this.app, this.host, () => this.update()),
				},
				onDelete: (index) => {
					const wiki = wikis[index];
					if (wiki) void this.stopSyncing(this.current(wiki));
				},
				items: wikis.map((wiki) => this.wikiPage(wiki)),
			},
		];
	}

	private renderAccount(setting: Setting): void {
		const did = this.host.signedIn();
		if (did) {
			const { account } = this.host.settings();
			setting
				.setName(account.startsWith("did:") ? account : `@${account}`)
				.addButton((button) =>
					button.setButtonText("Sign out").onClick(async () => {
						await this.host.signOut();
						this.update();
					}),
				);
			setting.nameEl.addClass("lichen-sync-account");
			void findProfile(did)
				.then((profile) => {
					if (!profile) return;
					setting.setName(`@${profile.handle}`);
					if (profile.avatar) {
						setting.nameEl.prepend(
							createEl("img", {
								cls: "lichen-sync-avatar",
								attr: { src: profile.avatar, alt: "" },
							}),
						);
					}
				})
				.catch(() => {});
			return;
		}
		let account = this.host.settings().account;
		setting
			.setName("Sign in")
			.setDesc(
				"Only to send your edits. Syncing a public wiki needs no account.",
			)
			.addText((text) => {
				text
					.setPlaceholder("alice.bsky.social")
					.setValue(account)
					.onChange((value) => {
						account = value;
					});
				new ActorSuggest(this.app, text.inputEl, (actor) => {
					account = actor.handle;
				});
			})
			.addButton((button) =>
				button
					.setButtonText("Sign in")
					.setCta()
					.onClick(async () => {
						button.setDisabled(true);
						await this.host.signIn(account);
						this.update();
					}),
			);
	}

	private wikiPage(wiki: SyncedWiki): SettingDefinitionPage {
		const url = `https://lichen.wiki/${wikiRef(wiki)}`;
		const value = (text: () => string) => (setting: Setting) => {
			setting.addDisplayValue((display) => display.setValue(text()));
		};
		return {
			type: "page",
			name: wiki.name || wikiSlug(wiki),
			displayValue: () => syncedLabel(this.current(wiki)),
			status: () => (this.conflictCopies(wiki).length > 0 ? "warning" : null),
			items: [
				{
					type: "group",
					cls: "lichen-sync-wiki",
					items: [
						{
							name: "Folder",
							render: value(() => folderLabel(this.current(wiki).folder)),
						},
						{
							name: "Access",
							render: (setting) => this.renderAccess(setting, wiki),
						},
						{
							name: "Last sync",
							render: value(() => lastSyncLabel(this.current(wiki))),
						},
						{
							name: "On lichen.wiki",
							render: (setting) => {
								setting.addDisplayValue(({ valueEl }) => {
									const link = valueEl.createEl("a", {
										text: wikiRef(wiki),
										href: url,
									});
									link.onclick = (event) => {
										event.preventDefault();
										window.open(url);
									};
								});
							},
						},
						{
							name: "Conflicts",
							desc: "Your versions of notes changed on lichen.wiki at the same time. Copy back what you want, then delete the copy.",
							visible: () => this.conflictCopies(wiki).length > 0,
							render: (setting) => {
								const count = this.conflictCopies(wiki).length;
								setting.addDisplayValue((display) =>
									display.setValue(`${count} to review`).setStatus("warning"),
								);
							},
						},
					],
				},
				{
					type: "group",
					heading: "Actions",
					cls: "lichen-sync-wiki",
					items: [
						{
							name: "Sync now",
							disabled: () => this.host.syncing(),
							action: () => void this.syncNow(wiki.uri),
						},
						{
							name: "Review conflicts",
							visible: () => this.conflictCopies(wiki).length > 0,
							action: () => void this.openConflicts(wiki),
						},
						{
							name: "Move folder…",
							visible: () => this.current(wiki).folder !== "",
							action: () => this.moveWiki(wiki.uri),
						},
					],
				},
				{
					type: "group",
					cls: "lichen-sync-danger",
					items: [
						{
							name: "Stop syncing",
							desc: wiki.folder
								? "Forgets this wiki. Its folder and files stay."
								: "Forgets this wiki. Your vault's files stay.",
							action: (el) => void this.stopSyncingFromPage(el, wiki),
						},
					],
				},
			],
		};
	}

	private renderAccess(setting: Setting, wiki: SyncedWiki): void {
		const account = this.host.signedIn();
		setting.addDisplayValue((display) => {
			display.setValue("Checking…");
			getWiki(this.host.appview, wiki.uri, account)
				.then((view) => {
					if (!view) {
						display.setValue("No longer on lichen.wiki");
					} else if (view.viewer?.canWrite) {
						display.setValue(
							`Can edit · ${capitalize(view.viewer.role ?? "member")}`,
						);
					} else {
						display.setValue(
							account ? "Read only" : "Read only · Sign in to edit",
						);
					}
				})
				.catch(() => display.setValue("Could not reach lichen.wiki"));
		});
	}

	private async syncNow(uri: ResourceUri): Promise<void> {
		const sync = this.host.syncWiki(uri);
		this.update();
		await sync;
		this.update();
	}

	private async stopSyncingFromPage(
		el: HTMLElement,
		wiki: SyncedWiki,
	): Promise<void> {
		// Obsidian has no API to leave a page, which would stay open and empty.
		const back = el
			.closest(".setting-page")
			?.querySelector<HTMLElement>(".setting-page-back-button");
		if (await this.stopSyncing(this.current(wiki))) back?.click();
	}

	private conflictCopies(wiki: SyncedWiki): TFile[] {
		const folder = this.app.vault.getFolderByPath(
			conflictsFolder(this.current(wiki).folder),
		);
		return (folder?.children ?? []).filter(
			(file): file is TFile => file instanceof TFile && file.extension === "md",
		);
	}

	private async openConflicts(wiki: SyncedWiki): Promise<void> {
		for (const file of this.conflictCopies(wiki)) {
			await this.app.workspace.getLeaf("tab").openFile(file);
		}
	}

	private moveWiki(uri: ResourceUri): void {
		const wiki = this.find(uri);
		if (!wiki) return;
		const { wikis } = this.host.settings();
		new FolderPickerModal(this.app, {
			placeholder: `Move ${wiki.folder} to…`,
			initial: wiki.folder,
			allowExisting: false,
			problem: (folder) =>
				isWithin(folder, wiki.folder)
					? `Inside ${wiki.folder} itself.`
					: clashProblem(folderClash(folder, wikis, uri)),
			onPick: async (folder) => {
				await this.host.moveWiki(uri, folder);
				this.update();
			},
		}).open();
	}

	/** Whether the user confirmed, and the wiki stopped syncing. */
	private async stopSyncing(wiki: SyncedWiki): Promise<boolean> {
		const stop = await confirm(this.app, {
			title: `Stop syncing “${wikiLabel(wiki)}”?`,
			message: `${wiki.folder ? `${wiki.folder} and its files stay` : "Your vault's files stay"} as they are. Syncing the wiki again later starts over: files that differ from lichen.wiki are set aside as conflict copies.`,
			action: "Stop syncing",
			destructive: true,
		});
		if (!stop) return false;
		await this.host.removeWiki(wiki.uri);
		new Notice(
			`Lichen Sync: stopped syncing ${wikiLabel(wiki)}. ${wiki.folder ? `${wiki.folder} stays as it is` : "Your files stay as they are"}.`,
		);
		this.update();
		return true;
	}

	private find(uri: ResourceUri): SyncedWiki | undefined {
		return findWiki(this.host.settings().wikis, uri);
	}

	// A page outlives a pull or a move, so it reads the wiki afresh.
	private current(wiki: SyncedWiki): SyncedWiki {
		return this.find(wiki.uri) ?? wiki;
	}
}

function lastSyncLabel(wiki: SyncedWiki): string {
	return wiki.pulledAt
		? capitalize(timeAgo(Date.parse(wiki.pulledAt)))
		: "Never";
}

function syncedLabel(wiki: SyncedWiki): string {
	return wiki.pulledAt
		? `Synced ${timeAgo(Date.parse(wiki.pulledAt))}`
		: "Not synced yet";
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	["day", 86_400],
	["hour", 3_600],
	["minute", 60],
];

function timeAgo(time: number): string {
	const seconds = (time - Date.now()) / 1000;
	const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
	for (const [unit, size] of UNITS) {
		if (Math.abs(seconds) >= size) {
			return format.format(Math.round(seconds / size), unit);
		}
	}
	return "just now";
}

function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}
