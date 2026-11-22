import { Client } from "@atcute/client";
import {
	type Did,
	isActorIdentifier,
	isDid,
	type ResourceUri,
} from "@atcute/lexicons/syntax";
import { SYNC_PLUGIN_PROTOCOL_ACTION } from "@lichen-wiki/client/sync-plugin-oauth";
import {
	Menu,
	Notice,
	type ObsidianProtocolData,
	Plugin,
	TFile,
	TFolder,
} from "obsidian";
import { canWrite, lichenAppview } from "../core/appview.ts";
import { conflictsFolder, isNotePath } from "../core/folders.ts";
import { bareActor } from "../core/identity.ts";
import {
	createWiki,
	type NewWikiFields,
	type NewWikiOutcome,
} from "../core/new-wiki.ts";
import {
	callbackParams,
	lichenOAuth,
	parsePendingSignIns,
	parseSessions,
	signedInDid,
	signInFailure,
} from "../core/oauth.ts";
import {
	holdsLoopbackSession,
	type PluginData,
	parsePluginData,
} from "../core/plugin-data.ts";
import { pullWiki } from "../core/pull.ts";
import { type PushReport, pushWiki } from "../core/push.ts";
import { RenameLog } from "../core/renames.ts";
import { describeSync } from "../core/report.ts";
import {
	findWiki,
	followFolderRename,
	type Settings,
	type SyncedWiki,
	wikiLabel,
} from "../core/settings.ts";
import {
	moveSyncedFolder,
	renameSyncedPath,
	type SyncState,
	type WikiState,
} from "../core/sync-state.ts";
import type { Vault } from "../core/vault.ts";
import type { WikiChoice } from "../core/wiki-search.ts";
import { type AddWikiHost, openAddWiki } from "./add-wiki.ts";
import { addLichenIcon, LICHEN_ICON } from "./icon.ts";
import { vaultSecret } from "./secrets.ts";
import { SettingsTab } from "./settings-tab.ts";
import { sleep } from "./sleep.ts";
import { hostVault } from "./vault.ts";

// The life of an OAuth state: past it, lichen.wiki's answer can no longer sign in.
const SIGN_IN_WAIT_MS = 10 * 60_000;

export class LichenSyncPlugin extends Plugin {
	private data: PluginData = parsePluginData(undefined);
	private syncing = false;
	private ribbon: HTMLElement | null = null;
	private signInWaiter: { readonly state: string; release(): void } | null =
		null;
	/** One per side of a sync in progress. */
	private readonly renameLogs = new Set<RenameLog>();
	private readonly appview = lichenAppview();
	private readonly sessions = vaultSecret(this.app, "session", parseSessions);
	private readonly oauth = lichenOAuth({
		sessions: this.sessions,
		signIns: vaultSecret(this.app, "sign-in", parsePendingSignIns),
	});
	private readonly wikiHost: AddWikiHost = {
		appview: this.appview,
		settings: () => this.data.settings,
		signedIn: () => signedInDid(this.sessions.get()),
		signIn: (account) => this.signIn(account),
		addWiki: (wiki, folder) => this.addWiki(wiki, folder),
		createWiki: (fields) => this.createWiki(fields),
	};
	private settingsTab: SettingsTab | null = null;

	override async onload(): Promise<void> {
		const saved: unknown = await this.loadData();
		this.data = parsePluginData(saved);
		if (holdsLoopbackSession(saved)) {
			await this.save(this.data);
			new Notice("Lichen Sync: signing in now works on mobile too.");
		}
		this.register(() => this.releaseSignInWaiter());
		this.registerObsidianProtocolHandler(SYNC_PLUGIN_PROTOCOL_ACTION, (data) =>
			this.finishSignIn(data),
		);
		this.settingsTab = new SettingsTab(this.app, this, {
			...this.wikiHost,
			signOut: () => this.signOut(),
			removeWiki: (uri) => this.removeWiki(uri),
			moveWiki: (uri, folder) => this.moveWiki(uri, folder),
			syncWiki: (uri) => this.sync([uri]),
			syncing: () => this.syncing,
		});
		this.addSettingTab(this.settingsTab);
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
				for (const log of this.renameLogs) log.record(oldPath, file.path);
				if (file instanceof TFolder) {
					void this.followFolder(oldPath, file.path);
				} else if (file instanceof TFile) {
					void this.followRename(oldPath, file.path);
				}
			}),
		);
	}

	private async followRename(from: string, to: string): Promise<void> {
		const sync = followSync(
			this.data.sync,
			this.data.settings.wikis,
			(state, isNote) => renameSyncedPath(state, from, to, isNote),
		);
		if (sync) await this.save({ ...this.data, sync });
	}

	// A wiki's folder, a folder holding it or one of its subfolders moved: the wiki and its notes follow.
	private async followFolder(from: string, to: string): Promise<void> {
		const { wikis } = this.data.settings;
		const moved = followFolderRename(wikis, from, to);
		const sync = followSync(this.data.sync, moved, (state, isNote) =>
			moveSyncedFolder(state, from, to, isNote),
		);
		if (!sync && moved.every((wiki, i) => wiki === wikis[i])) return;
		await this.save({
			...this.data,
			settings: { ...this.data.settings, wikis: moved },
			sync: sync ?? this.data.sync,
		});
		if (wikis.some((wiki) => wiki.folder === from)) {
			await this.moveConflictCopies(from, to);
		}
	}

	// Conflict copies sit beside the wiki's folder rather than in it, so they follow it here.
	private async moveConflictCopies(from: string, to: string): Promise<void> {
		const copies = this.app.vault.getFolderByPath(conflictsFolder(from));
		const target = conflictsFolder(to);
		if (!copies || this.app.vault.getAbstractFileByPath(target)) return;
		try {
			await this.app.fileManager.renameFile(copies, target);
		} catch (err) {
			new Notice(`Lichen Sync: moving ${copies.path} failed. ${reasonOf(err)}`);
		}
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

	private async createWiki(
		fields: NewWikiFields,
	): Promise<NewWikiOutcome | null> {
		const did = signedInDid(this.sessions.get());
		const pds = did ? await this.restorePds(did) : null;
		if (!did || !pds) return null;
		const { account } = this.data.settings;
		const handle = account && !isDid(account) ? account : null;
		return createWiki(this.appview, pds, { did, handle }, fields, { sleep });
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
		const wiki = findWiki(this.data.settings.wikis, uri);
		// The vault's root cannot move.
		if (!wiki?.folder || wiki.folder === folder) return;
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

	/** Opens lichen.wiki's sign-in in the browser, and settles once Obsidian is back with its answer. */
	private async signIn(account: string): Promise<void> {
		this.releaseSignInWaiter();
		try {
			const actor = bareActor(account);
			if (!isActorIdentifier(actor)) {
				throw new Error(`Not a handle or a DID: "${account}"`);
			}
			await this.saveSettings({ account: actor });
			const { url, stateId } = await this.oauth.authorize({
				target: { type: "account", identifier: actor },
			});
			const answered = new Promise<void>((resolve) => {
				const timer = window.setTimeout(
					() => this.releaseSignInWaiter(),
					SIGN_IN_WAIT_MS,
				);
				this.signInWaiter = {
					state: stateId,
					release: () => {
						window.clearTimeout(timer);
						resolve();
					},
				};
			});
			window.open(url.href);
			await answered;
		} catch (err) {
			new Notice(`Lichen Sync: ${signInFailure(err)}`);
		}
	}

	// Also reached with no sign-in waiting in memory: a phone may have closed Obsidian meanwhile.
	private async finishSignIn(data: ObsidianProtocolData): Promise<void> {
		const params = callbackParams(data);
		try {
			const { session } = await this.oauth.callback(params);
			const { account } = this.data.settings;
			new Notice(`Lichen Sync: signed in as ${account} (${session.did}).`);
		} catch (err) {
			new Notice(`Lichen Sync: ${signInFailure(err)}`);
		} finally {
			if (this.signInWaiter?.state === params.get("state")) {
				this.releaseSignInWaiter();
			}
			this.settingsTab?.update();
		}
	}

	private releaseSignInWaiter(): void {
		const waiter = this.signInWaiter;
		this.signInWaiter = null;
		waiter?.release();
	}

	private async signOut(): Promise<void> {
		const did = signedInDid(this.sessions.get());
		if (!did) return;
		try {
			await this.oauth.revoke(did);
		} catch (err) {
			// The session goes either way; the server lets the token expire.
			console.warn("Lichen Sync: revoking the session failed.", err);
		} finally {
			await this.sessions.save({});
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
						.setTitle(`Sync ${wikiLabel(wiki)}`)
						.setIcon("folder")
						.setDisabled(this.syncing)
						.onClick(() => this.sync([wiki.uri])),
				);
			}
			menu.addSeparator();
		}
		menu.addItem((item) =>
			item
				.setTitle("Add a wiki…")
				.setIcon("plus")
				.onClick(() =>
					openAddWiki(this.app, this.wikiHost, () =>
						this.settingsTab?.update(),
					),
				),
		);
		menu.addItem((item) =>
			item
				.setTitle("Settings")
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
		const wiki = findWiki(this.data.settings.wikis, uri);
		if (!wiki) return;
		const label = wikiLabel(wiki);
		try {
			const pulled = await this.followingRenames(uri, (vault, folder, known) =>
				pullWiki(this.appview, vault, uri, folder, known),
			);
			if (!pulled) return;
			await this.saveSync(uri, pulled.state, new Date().toISOString());
			let pushed: PushReport | null = null;
			const did = signedInDid(this.sessions.get());
			const pds =
				did && (await canWrite(this.appview, uri, did))
					? await author(did)
					: null;
			if (did && pds) {
				const result = await this.followingRenames(
					uri,
					(vault, folder, known) =>
						pushWiki(this.appview, pds, did, vault, uri, folder, known, {
							sleep,
						}),
				);
				if (result) {
					await this.saveSync(uri, result.state);
					pushed = result.report;
				}
			}
			new Notice(describeSync(label, pulled.report, pushed));
		} catch (err) {
			new Notice(`Lichen Sync: syncing ${label} failed. ${reasonOf(err)}`);
		}
	}

	/**
	 * Runs one side of a sync against the vault as it stood when that side began, then moves its
	 * state's paths to where files went meanwhile. Null when the wiki stopped syncing.
	 */
	private async followingRenames<R extends { state: WikiState }>(
		uri: ResourceUri,
		run: (vault: Vault, folder: string, known: WikiState) => Promise<R>,
	): Promise<R | null> {
		const wiki = findWiki(this.data.settings.wikis, uri);
		if (!wiki) return null;
		const log = new RenameLog();
		this.renameLogs.add(log);
		try {
			const result = await run(
				log.vault(hostVault(this.app)),
				wiki.folder,
				this.data.sync[uri] ?? {},
			);
			const folder = log.follow(wiki.folder);
			return {
				...result,
				state: log.followState(result.state, (path) =>
					isNotePath(folder, path),
				),
			};
		} finally {
			this.renameLogs.delete(log);
		}
	}

	// A lapsed session still lets every wiki pull.
	private async restorePds(did: Did): Promise<Client | null> {
		try {
			return new Client({ handler: await this.oauth.restore(did) });
		} catch (err) {
			new Notice(
				`Lichen Sync: sign in again to send your edits. ${reasonOf(err)}`,
			);
			return null;
		}
	}

	private async saveSync(
		uri: ResourceUri,
		state: WikiState,
		pulledAt?: string,
	): Promise<void> {
		if (!findWiki(this.data.settings.wikis, uri)) return;
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

/** The sync state with each wiki's notes moved by `move`, or null when none moved. */
function followSync(
	sync: SyncState,
	wikis: readonly SyncedWiki[],
	move: (state: WikiState, isNote: (path: string) => boolean) => WikiState,
): SyncState | null {
	let changed = false;
	const followed: Record<string, WikiState> = {};
	for (const [uri, state] of Object.entries(sync)) {
		const wiki = findWiki(wikis, uri);
		followed[uri] = wiki
			? move(state, (path) => isNotePath(wiki.folder, path))
			: state;
		changed ||= followed[uri] !== state;
	}
	return changed ? followed : null;
}

function reasonOf(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
