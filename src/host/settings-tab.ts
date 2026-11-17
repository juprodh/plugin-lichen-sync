import type { Client } from "@atcute/client";
import type { Did, ResourceUri } from "@atcute/lexicons/syntax";
import {
	type App,
	Notice,
	type Plugin,
	PluginSettingTab,
	type Setting,
	type SettingDefinitionItem,
	type SettingDefinitionPage,
} from "obsidian";
import { getWiki } from "../core/appview.ts";
import {
	folderClash,
	isWithin,
	type Settings,
	type SyncedWiki,
	wikiRef,
	wikiSlug,
} from "../core/settings.ts";
import { getProfile, type WikiChoice } from "../core/suggest.ts";
import { FolderPickerModal } from "./folder-picker.ts";
import { ActorSuggest } from "./suggest.ts";
import { WikiPickerModal } from "./wiki-picker.ts";

/** What the tab asks of the plugin, which owns data.json. */
interface SettingsHost {
	readonly appview: Client;
	settings(): Settings;
	signedIn(): Did | undefined;
	signIn(account: string): Promise<void>;
	signOut(): Promise<void>;
	addWiki(wiki: WikiChoice, folder: string): Promise<void>;
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
				addItem: { name: "Add wiki", action: () => this.addWiki() },
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
			void getProfile(did)
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
			items: [
				{
					type: "group",
					items: [
						{ name: "Folder", render: value(() => this.current(wiki).folder) },
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
					],
				},
				{
					type: "group",
					heading: "Actions",
					items: [
						{
							name: "Sync now",
							disabled: () => this.host.syncing(),
							action: async () => {
								const sync = this.host.syncWiki(wiki.uri);
								this.update();
								await sync;
								this.update();
							},
						},
						{ name: "Move folder…", action: () => this.moveWiki(wiki.uri) },
					],
				},
				{
					type: "group",
					cls: "lichen-sync-danger",
					items: [
						{
							name: "Stop syncing",
							desc: `Forgets this wiki. The folder ${wiki.folder} and its files stay.`,
							action: async (el) => {
								// The page would stay open on a wiki that is gone; Obsidian has no API to leave it.
								el.closest(".setting-page")
									?.querySelector<HTMLElement>(".setting-page-back-button")
									?.click();
								await this.stopSyncing(this.current(wiki));
							},
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

	private addWiki(): void {
		new WikiPickerModal(this.app, {
			appview: this.host.appview,
			account: this.host.signedIn(),
			syncedFolder: (uri) => this.find(uri)?.folder,
			onSignIn: async (handle) => {
				await this.host.signIn(handle);
				this.update();
				// Back to the picker, now listing your wikis.
				if (this.host.signedIn()) this.addWiki();
			},
			onPick: (choice) => {
				const synced = this.find(choice.uri);
				if (synced) {
					new Notice(
						`Lichen Sync: ${choice.name} already syncs into ${synced.folder}.`,
					);
					return;
				}
				const { wikis } = this.host.settings();
				new FolderPickerModal(this.app, {
					placeholder: `Folder for ${choice.name}`,
					initial: choice.slug,
					allowExisting: true,
					problem: (folder) => clashProblem(folderClash(folder, wikis)),
					onPick: async (folder) => {
						await this.host.addWiki(choice, folder);
						this.update();
					},
				}).open();
			},
		}).open();
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

	private async stopSyncing(wiki: SyncedWiki): Promise<void> {
		await this.host.removeWiki(wiki.uri);
		new Notice(
			`Lichen Sync: stopped syncing ${wiki.name || wikiRef(wiki)}. ${wiki.folder} stays as it is.`,
		);
		this.update();
	}

	private find(uri: ResourceUri): SyncedWiki | undefined {
		return this.host.settings().wikis.find((wiki) => wiki.uri === uri);
	}

	// A page outlives a pull or a move, so it reads the wiki afresh.
	private current(wiki: SyncedWiki): SyncedWiki {
		return this.find(wiki.uri) ?? wiki;
	}
}

function clashProblem(clash: SyncedWiki | undefined): string | null {
	return clash
		? `${clash.folder} already syncs ${clash.name || wikiRef(clash)}; wiki folders cannot nest.`
		: null;
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
