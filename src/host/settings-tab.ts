import { isValidWikiSlug } from "@lichen/client/slug";
import {
	type App,
	type Plugin,
	PluginSettingTab,
	type SettingDefinitionItem,
} from "obsidian";
import type { Settings } from "../core/settings.ts";

// Settings share data.json with the sync state, so they save through the plugin
// rather than PluginSettingTab's default, which writes plugin.settings alone.
interface SettingsStore {
	get(): Settings;
	save(settings: Settings): Promise<void>;
}

function isSettingsKey(key: string): key is keyof Settings {
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

	override getSettingDefinitions(): SettingDefinitionItem<keyof Settings>[] {
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
		];
	}

	override getControlValue(key: string): unknown {
		return isSettingsKey(key) ? this.store.get()[key] : undefined;
	}

	override async setControlValue(key: string, value: unknown): Promise<void> {
		if (!isSettingsKey(key) || typeof value !== "string") return;
		await this.store.save({ ...this.store.get(), [key]: value });
	}
}
