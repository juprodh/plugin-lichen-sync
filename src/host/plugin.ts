import { Client } from "@atcute/client";
import {
	type Did,
	isActorIdentifier,
	type ResourceUri,
} from "@atcute/lexicons/syntax";
import { Menu, Notice, Platform, Plugin, TFile, TFolder } from "obsidian";
import { canWrite, lichenAppview } from "../core/appview.ts";
import { lichenOAuth, signedInDid } from "../core/oauth.ts";
import { type PluginData, parsePluginData } from "../core/plugin-data.ts";
import { pullWiki } from "../core/pull.ts";
import { type PushReport, pushWiki } from "../core/push.ts";
import { describeSync } from "../core/report.ts";
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
import { addLichenIcon, LICHEN_ICON } from "./icon.ts";
import { type CallbackListener, listenForCallback } from "./loopback.ts";
import { SettingsTab } from "./settings-tab.ts";
import { hostVault } from "./vault.ts";

export class LichenSyncPlugin extends Plugin {
	private data: PluginData = parsePluginData(undefined);
	private syncing = false;
	private ribbon: HTMLElement | null = null;
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
				syncWiki: (uri) => this.sync([uri]),
			}),
		);
		this.addCommand({
			id: "sync",
			name: "Sync all wikis",
			callback: () => this.syncAll(),
		});
		addLichenIcon();
		this.ribbon = this.addRibbonIcon(LICHEN_ICON, "Lichen Sync", (evt) =>
			this.openMenu(evt),
		);
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
		await this.sync([wiki.uri]);
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

	private openMenu(evt: MouseEvent): void {
		const menu = new Menu();
		const { wikis } = this.data.settings;
		if (wikis.length > 0) {
			menu.addItem((item) =>
				item
					.setTitle("Sync all wikis")
					.setIcon("folder-sync")
					.setDisabled(this.syncing)
					.onClick(() => this.syncAll()),
			);
			menu.addSeparator();
			for (const wiki of wikis) {
				menu.addItem((item) =>
					item
						.setTitle(`Sync ${wiki.name || wikiRef(wiki)}`)
						.setIcon("folder")
						.setDisabled(this.syncing)
						.onClick(() => this.sync([wiki.uri])),
				);
			}
			menu.addSeparator();
		}
		menu.addItem((item) =>
			item
				.setTitle(wikis.length > 0 ? "Settings" : "Add a wiki")
				.setIcon("settings")
				.onClick(() => this.openSettings()),
		);
		menu.showAtMouseEvent(evt);
	}

	// Obsidian's API has no call that opens a plugin's own settings tab, so this one may go away.
	private openSettings(): void {
		const { setting } = this.app as unknown as {
			setting?: { open?(): void; openTabById?(id: string): void };
		};
		if (!setting?.open || !setting.openTabById) {
			new Notice("Lichen Sync: open Settings → Lichen Sync.");
			return;
		}
		setting.open();
		setting.openTabById(this.manifest.id);
	}

	private syncAll(): Promise<void> {
		return this.sync(this.data.settings.wikis.map((wiki) => wiki.uri));
	}

	private async sync(uris: readonly ResourceUri[]): Promise<void> {
		if (uris.length === 0) {
			new Notice("Lichen Sync: add a wiki in settings first.");
			return;
		}
		if (this.syncing) return;
		this.syncing = true;
		this.ribbon?.addClass("lichen-sync-syncing");
		let pds: Promise<Client | null> | undefined;
		// Restored once a wiki takes a push, so a sync of pull-only wikis refreshes no token.
		const author = (did: Did) => {
			pds ??= this.restorePds(did);
			return pds;
		};
		try {
			for (const uri of uris) await this.syncOne(uri, author);
		} finally {
			this.syncing = false;
			this.ribbon?.removeClass("lichen-sync-syncing");
		}
	}

	private async syncOne(
		uri: ResourceUri,
		author: (did: Did) => Promise<Client | null>,
	): Promise<void> {
		const wiki = this.data.settings.wikis.find((w) => w.uri === uri);
		if (!wiki) return;
		const label = wiki.name || wikiRef(wiki);
		try {
			const pulled = await pullWiki(
				this.appview,
				hostVault(this.app),
				uri,
				wiki.folder,
				this.data.sync[uri] ?? {},
			);
			await this.saveSync(uri, pulled.state, new Date().toISOString());
			let pushed: PushReport | null = null;
			const did = signedInDid(this.data.sessions);
			const pds =
				did && (await canWrite(this.appview, uri, did))
					? await author(did)
					: null;
			if (did && pds) {
				const result = await pushWiki(
					this.appview,
					pds,
					did,
					hostVault(this.app),
					uri,
					wiki.folder,
					pulled.state,
				);
				await this.saveSync(uri, result.state);
				pushed = result.report;
			}
			new Notice(describeSync(label, pulled.report, pushed));
		} catch (err) {
			new Notice(`Lichen Sync: syncing ${label} failed. ${reasonOf(err)}`);
		}
	}

	// A lapsed session still lets every wiki pull.
	private async restorePds(did: Did): Promise<Client | null> {
		try {
			return new Client({ handler: await this.oauth.restore(did) });
		} catch (err) {
			new Notice(
				`Lichen Sync: sign in again to push your edits. ${reasonOf(err)}`,
			);
			return null;
		}
	}

	private async saveSync(
		uri: ResourceUri,
		state: SyncState[string],
		pulledAt?: string,
	): Promise<void> {
		await this.save({
			...this.data,
			settings: pulledAt
				? {
						...this.data.settings,
						wikis: this.data.settings.wikis.map((w) =>
							w.uri === uri ? { ...w, pulledAt } : w,
						),
					}
				: this.data.settings,
			sync: { ...this.data.sync, [uri]: state },
		});
	}
}

function reasonOf(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
