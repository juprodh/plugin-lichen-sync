import { Notice, Plugin, TFile } from "obsidian";
import { lichenAppview } from "../core/appview.ts";
import { resolveWiki } from "../core/identity.ts";
import { type PluginData, parsePluginData } from "../core/plugin-data.ts";
import { type PullReport, pullWiki } from "../core/pull.ts";
import { renameSyncedPath, type SyncState } from "../core/sync-state.ts";
import { SettingsTab } from "./settings-tab.ts";
import { hostVault } from "./vault.ts";

export class LichenSyncPlugin extends Plugin {
	private data: PluginData = parsePluginData(undefined);
	private pulling = false;

	override async onload(): Promise<void> {
		this.data = parsePluginData(await this.loadData());
		this.addSettingTab(
			new SettingsTab(this.app, this, {
				get: () => this.data.settings,
				save: (settings) => this.save({ ...this.data, settings }),
			}),
		);
		this.addCommand({
			id: "pull",
			name: "Pull wiki",
			callback: () => this.pull(),
		});
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (file instanceof TFile) void this.followRename(oldPath, file.path);
			}),
		);
	}

	private async followRename(from: string, to: string): Promise<void> {
		const sync: Record<string, SyncState[string]> = {};
		for (const [wiki, state] of Object.entries(this.data.sync)) {
			sync[wiki] = renameSyncedPath(state, from, to);
		}
		if (Object.keys(sync).some((wiki) => sync[wiki] !== this.data.sync[wiki])) {
			await this.save({ ...this.data, sync });
		}
	}

	private async save(data: PluginData): Promise<void> {
		this.data = data;
		await this.saveData(data);
	}

	private async pull(): Promise<void> {
		const { owner, wikiSlug } = this.data.settings;
		if (!owner || !wikiSlug) {
			new Notice("Lichen Sync: set the owner and the wiki in settings first.");
			return;
		}
		if (this.pulling) return;
		this.pulling = true;
		try {
			const wiki = await resolveWiki(owner, wikiSlug);
			const { state, report } = await pullWiki(
				lichenAppview(),
				hostVault(this.app),
				wiki,
				wikiSlug,
				this.data.sync[wiki] ?? {},
			);
			await this.save({
				...this.data,
				sync: { ...this.data.sync, [wiki]: state },
			});
			new Notice(describePull(report));
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			new Notice(`Lichen Sync: pull failed. ${reason}`);
		} finally {
			this.pulling = false;
		}
	}
}

function describePull(report: PullReport): string {
	const { written, merged, conflictCopies, recoveredCopies, gone } = report;
	const lines = [
		`Lichen Sync: ${written.length + merged.length} note(s) updated.`,
	];
	if (conflictCopies.length > 0) {
		lines.push(
			`Edited here and on lichen.wiki; your version is in: ${conflictCopies.join(", ")}`,
		);
	}
	if (recoveredCopies.length > 0) {
		lines.push(
			`Found without sync state; the earlier text is in: ${recoveredCopies.join(", ")}`,
		);
	}
	if (gone.length > 0) {
		lines.push(`No longer on lichen.wiki, left as is: ${gone.join(", ")}`);
	}
	return lines.join("\n");
}
