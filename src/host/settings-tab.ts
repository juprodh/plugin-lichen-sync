import type { Did } from "@atcute/lexicons/syntax";
import { isValidWikiSlug } from "@lichen/client/slug";
import {
	type App,
	type Plugin,
	PluginSettingTab,
	type Setting,
	type SettingDefinitionItem,
} from "obsidian";
import type { Settings } from "../core/settings.ts";

// Settings share data.json with the sync state, so they save through the plugin
// rather than PluginSettingTab's default, which writes plugin.settings alone.
interface SettingsStore {
	get(): Settings;
	save(settings: Settings): Promise<void>;
	signedIn(): Did | undefined;
	signIn(account: string): Promise<void>;
	signOut(): Promise<void>;
}

type ControlKey = "owner" | "wikiSlug";

function isControlKey(key: string): key is ControlKey {
	return key === "owner" || key === "wikiSlug";
}

export class SettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: Plugin,
		private readonly store: SettingsStore,
	) {
		super(app, plugin);
	}

	override getSettingDefinitions(): SettingDefinitionItem<ControlKey>[] {
		return [
			{
				name: "Owner",
				desc: "The wiki owner's handle or DID.",
				control: {
					type: "text",
					key: "owner",
					placeholder: "alice.bsky.social",
				},
			},
			{
				name: "Wiki",
				desc: "The wiki's slug, as in lichen.wiki/@handle/slug. It also names the vault folder.",
				control: {
					type: "text",
					key: "wikiSlug",
					validate: (slug) =>
						slug === "" || isValidWikiSlug(slug)
							? undefined
							: "Lowercase letters, digits and hyphens only.",
				},
			},
			{
				name: "Account",
				render: (setting) => this.renderAccount(setting),
			},
		];
	}

	private renderAccount(setting: Setting): void {
		const did = this.store.signedIn();
		if (did) {
			setting
				.setDesc(`Signed in as ${this.store.get().account} (${did}).`)
				.addButton((button) =>
					button.setButtonText("Sign out").onClick(async () => {
						await this.store.signOut();
						this.update();
					}),
				);
			return;
		}
		let account = this.store.get().account;
		setting
			.setDesc("Your handle, to push edits. Signing in opens your browser.")
			.addText((text) =>
				text
					.setPlaceholder("alice.bsky.social")
					.setValue(account)
					.onChange((value) => {
						account = value;
					}),
			)
			.addButton((button) =>
				button
					.setButtonText("Sign in")
					.setCta()
					.onClick(async () => {
						button.setDisabled(true);
						await this.store.signIn(account);
						this.update();
					}),
			);
	}

	override getControlValue(key: string): unknown {
		return isControlKey(key) ? this.store.get()[key] : undefined;
	}

	override async setControlValue(key: string, value: unknown): Promise<void> {
		if (!isControlKey(key) || typeof value !== "string") return;
		await this.store.save({ ...this.store.get(), [key]: value });
	}
}
