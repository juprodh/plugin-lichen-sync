import { isActorIdentifier, type ResourceUri } from "@atcute/lexicons/syntax";
import { Notice, Platform, Plugin, TFile, TFolder } from "obsidian";
import { lichenAppview } from "../core/appview.ts";
import { lichenOAuth, signedInDid } from "../core/oauth.ts";
import { type PluginData, parsePluginData } from "../core/plugin-data.ts";
import { type PullReport, pullWiki } from "../core/pull.ts";
import {
	followFolderRename,
	type Settings,
	type SyncedWiki,
	wikiRef,
} from "../core/settings.ts";
import type { WikiChoice } from "../core/suggest.ts";
import {
	moveSyncedFolder,
	renameSyncedPath,
	type SyncState,
} from "../core/sync-state.ts";
import { type CallbackListener, listenForCallback } from "./loopback.ts";
import { SettingsTab } from "./settings-tab.ts";
import { hostVault } from "./vault.ts";

export class LichenSyncPlugin extends Plugin {
	private data: PluginData = parsePluginData(undefined);
	private pulling = false;
	private signInListener: CallbackListener | null = null;
	private readonly appview = lichenAppview();
	private readonly oauth = lichenOAuth({
		get: () => this.data.sessions,
		save: (sessions) => this.save({ ...this.data, sessions }),
	});

	override async onload(): Promise<void> {
		this.data = parsePluginData(await this.loadData());
		this.register(() => this.stopSignIn());
		this.addSettingTab(
			new SettingsTab(this.app, this, {
				appview: this.appview,
				settings: () => this.data.settings,
				signedIn: () => signedInDid(this.data.sessions),
				signIn: (account) => this.signIn(account),
				signOut: () => this.signOut(),
				addWiki: (wiki, folder) => this.addWiki(wiki, folder),
				removeWiki: (uri) => this.removeWiki(uri),
				moveWiki: (uri, folder) => this.moveWiki(uri, folder),
				pullWiki: (uri) => this.pull([uri]),
			}),
		);
		this.addCommand({
			id: "pull",
			name: "Pull all wikis",
			callback: () =>
				this.pull(this.data.settings.wikis.map((wiki) => wiki.uri)),
		});
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (file instanceof TFolder) {
					void this.followFolder(oldPath, file.path);
				} else if (file instanceof TFile) {
					void this.followRename(oldPath, file.path);
				}
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

	// A wiki's folder, or a folder holding it, moved: the wiki and its notes follow.
	private async followFolder(from: string, to: string): Promise<void> {
		const { wikis } = this.data.settings;
		const moved = followFolderRename(wikis, from, to);
		if (moved.every((wiki, i) => wiki === wikis[i])) return;
		const sync: Record<string, SyncState[string]> = {};
		for (const [wiki, state] of Object.entries(this.data.sync)) {
			sync[wiki] = moveSyncedFolder(state, from, to);
		}
		await this.save({
			...this.data,
			settings: { ...this.data.settings, wikis: moved },
			sync,
		});
	}

	private async addWiki(choice: WikiChoice, folder: string): Promise<void> {
		const wiki: SyncedWiki = {
			uri: choice.uri,
			folder,
			name: choice.name,
			ownerHandle: choice.ownerHandle ?? "",
			pulledAt: "",
		};
		await this.saveSettings({
			wikis: [...this.data.settings.wikis, wiki],
		});
		await this.pull([wiki.uri]);
	}

	// The files stay: they are the user's notes as much as the wiki's.
	private async removeWiki(uri: ResourceUri): Promise<void> {
		const { [uri]: _, ...sync } = this.data.sync;
		await this.save({
			...this.data,
			settings: {
				...this.data.settings,
				wikis: this.data.settings.wikis.filter((wiki) => wiki.uri !== uri),
			},
			sync,
		});
	}

	private async moveWiki(uri: ResourceUri, folder: string): Promise<void> {
		const wiki = this.data.settings.wikis.find((w) => w.uri === uri);
		if (!wiki || wiki.folder === folder) return;
		const current = this.app.vault.getFolderByPath(wiki.folder);
		try {
			if (current) {
				const parent = folder.split("/").slice(0, -1).join("/");
				if (parent && !this.app.vault.getFolderByPath(parent)) {
					await this.app.vault.createFolder(parent);
				}
				await this.app.fileManager.renameFile(current, folder);
			}
			// The rename event may have followed it already; following twice changes nothing.
			await this.followFolder(wiki.folder, folder);
		} catch (err) {
			new Notice(`Lichen Sync: moving ${wiki.folder} failed. ${reasonOf(err)}`);
		}
	}

	private async save(data: PluginData): Promise<void> {
		this.data = data;
		await this.saveData(data);
	}

	private async saveSettings(change: Partial<Settings>): Promise<void> {
		await this.save({
			...this.data,
			settings: { ...this.data.settings, ...change },
		});
	}

	private async signIn(account: string): Promise<void> {
		// A new sign-in replaces one still waiting on the browser, which would hold the port.
		this.stopSignIn();
		let listener: CallbackListener | null = null;
		try {
			const actor = account.trim().replace(/^@/, "");
			if (!isActorIdentifier(actor)) {
				throw new Error(`Not a handle or a DID: "${account}"`);
			}
			if (!Platform.isDesktopApp) {
				throw new Error("Signing in needs the desktop app for now.");
			}
			await this.saveSettings({ account: actor });
			listener = await listenForCallback();
			this.signInListener = listener;
			const { url } = await this.oauth.authorize({
				target: { type: "account", identifier: actor },
			});
			window.open(url.href);
			const { session } = await this.oauth.callback(await listener.params);
			new Notice(`Lichen Sync: signed in as ${actor} (${session.did}).`);
		} catch (err) {
			// A sign-in replaced or stopped on unload ends quietly.
			if (listener && this.signInListener !== listener) return;
			new Notice(`Lichen Sync: sign-in failed. ${reasonOf(err)}`);
		} finally {
			listener?.close();
			if (this.signInListener === listener) this.signInListener = null;
		}
	}

	private stopSignIn(): void {
		const listener = this.signInListener;
		this.signInListener = null;
		listener?.close();
	}

	private async signOut(): Promise<void> {
		const did = signedInDid(this.data.sessions);
		if (!did) return;
		try {
			await this.oauth.revoke(did);
		} catch (err) {
			// The session goes either way; the server lets the token expire.
			console.warn("Lichen Sync: revoking the session failed.", err);
		} finally {
			await this.save({ ...this.data, sessions: {} });
		}
	}

	private async pull(uris: readonly ResourceUri[]): Promise<void> {
		if (uris.length === 0) {
			new Notice("Lichen Sync: add a wiki in settings first.");
			return;
		}
		if (this.pulling) return;
		this.pulling = true;
		try {
			for (const uri of uris) await this.pullOne(uri);
		} finally {
			this.pulling = false;
		}
	}

	private async pullOne(uri: ResourceUri): Promise<void> {
		const wiki = this.data.settings.wikis.find((w) => w.uri === uri);
		if (!wiki) return;
		const label = wiki.name || wikiRef(wiki);
		try {
			const { state, report } = await pullWiki(
				this.appview,
				hostVault(this.app),
				uri,
				wiki.folder,
				this.data.sync[uri] ?? {},
			);
			const pulledAt = new Date().toISOString();
			await this.save({
				...this.data,
				settings: {
					...this.data.settings,
					wikis: this.data.settings.wikis.map((w) =>
						w.uri === uri ? { ...w, pulledAt } : w,
					),
				},
				sync: { ...this.data.sync, [uri]: state },
			});
			new Notice(describePull(label, report));
		} catch (err) {
			new Notice(`Lichen Sync: pulling ${label} failed. ${reasonOf(err)}`);
		}
	}
}

function reasonOf(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function describePull(label: string, report: PullReport): string {
	const { written, merged, conflictCopies, recoveredCopies, gone } = report;
	const lines = [
		`Lichen Sync: ${label}, ${written.length + merged.length} note(s) updated.`,
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
