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
	pullWiki(uri: ResourceUri): Promise<void>;
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
				items: [
					{ name: "Account", render: (setting) => this.renderAccount(setting) },
				],
			},
			{
				type: "list",
				heading: "Wikis",
				emptyState: "No wikis yet. Add one to pull its notes into a folder.",
				addItem: { name: "Add wiki", action: () => this.addWiki() },
				items: wikis.map((wiki) => this.wikiPage(wiki)),
			},
		];
	}

	private renderAccount(setting: Setting): void {
		const did = this.host.signedIn();
		if (did) {
			setting
				.setName(this.host.settings().account)
				.setDesc("Signed in, so you can push to the wikis you write in.")
				.addButton((button) =>
					button.setButtonText("Sign out").onClick(async () => {
						await this.host.signOut();
						this.update();
					}),
				);
			void getProfile(did)
				.then((profile) => {
					if (!profile) return;
					setting.setName(profile.displayName ?? `@${profile.handle}`);
					if (profile.displayName) {
						setting.setDesc(`@${profile.handle} · signed in`);
					}
					if (profile.avatar) {
						setting.nameEl.prepend(
							createEl("img", {
								cls: "lichen-sync-account-avatar",
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
				"Only to push your edits. Pulling a public wiki needs no account.",
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
		return {
			type: "page",
			name: wiki.name || wikiSlug(wiki),
			desc: `${wikiRef(wiki)} → ${wiki.folder}`,
			displayValue: () => pulledLabel(this.current(wiki)),
			items: [
				{
					name: "Folder",
					render: (setting) =>
						setting
							.setDesc(this.current(wiki).folder)
							.addButton((button) =>
								button
									.setButtonText("Move…")
									.onClick(() => this.moveWiki(wiki.uri)),
							),
				},
				{
					name: "Access",
					render: (setting) => this.renderAccess(setting, wiki),
				},
				{
					name: "Last pull",
					render: (setting) =>
						setting
							.setDesc(pulledLabel(this.current(wiki)))
							.addButton((button) =>
								button.setButtonText("Pull now").onClick(async () => {
									button.setDisabled(true);
									await this.host.pullWiki(wiki.uri);
									this.update();
								}),
							),
				},
				{
					name: "On lichen.wiki",
					render: (setting) =>
						setting
							.setDesc(url)
							.addButton((button) =>
								button.setButtonText("Open").onClick(() => window.open(url)),
							),
				},
				{
					name: "Stop syncing",
					render: (setting) =>
						setting
							.setDesc(
								`Forgets this wiki. The folder ${wiki.folder} and its files stay.`,
							)
							.addButton((button) =>
								button
									.setButtonText("Stop syncing")
									.setWarning()
									.onClick(async () => {
										// The page would stay open on a wiki that is gone; Obsidian has no API to leave it.
										button.buttonEl
											.closest(".setting-page")
											?.querySelector<HTMLElement>(".setting-page-back-button")
											?.click();
										await this.stopSyncing(wiki);
									}),
							),
				},
			],
		};
	}

	private renderAccess(setting: Setting, wiki: SyncedWiki): void {
		const account = this.host.signedIn();
		setting.setDesc("Checking…");
		getWiki(this.host.appview, wiki.uri, account)
			.then((view) => {
				if (!view) {
					setting.setDesc("lichen.wiki no longer lists this wiki.");
				} else if (!account) {
					setting.setDesc("Pull only. Sign in as a contributor to push.");
				} else if (view.viewer?.canWrite) {
					setting.setDesc(
						`${capitalize(view.viewer.role ?? "member")}: you can push.`,
					);
				} else {
					setting.setDesc("Pull only: you are not a contributor.");
				}
			})
			.catch(() => setting.setDesc("Could not reach lichen.wiki."));
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

function pulledLabel(wiki: SyncedWiki): string {
	return wiki.pulledAt
		? `Pulled ${timeAgo(Date.parse(wiki.pulledAt))}`
		: "Not pulled yet";
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
