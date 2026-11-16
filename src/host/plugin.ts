import { isActorIdentifier } from "@atcute/lexicons/syntax";
import { Notice, Platform, Plugin, TFile } from "obsidian";
import { lichenAppview } from "../core/appview.ts";
import { resolveWiki } from "../core/identity.ts";
import { lichenOAuth, signedInDid } from "../core/oauth.ts";
import { type PluginData, parsePluginData } from "../core/plugin-data.ts";
import { type PullReport, pullWiki } from "../core/pull.ts";
import { renameSyncedPath, type SyncState } from "../core/sync-state.ts";
import { type CallbackListener, listenForCallback } from "./loopback.ts";
import { SettingsTab } from "./settings-tab.ts";
import { hostVault } from "./vault.ts";

export class LichenSyncPlugin extends Plugin {
	private data: PluginData = parsePluginData(undefined);
	private pulling = false;
	private signInListener: CallbackListener | null = null;
	private readonly oauth = lichenOAuth({
		get: () => this.data.sessions,
		save: (sessions) => this.save({ ...this.data, sessions }),
	});

	override async onload(): Promise<void> {
		this.data = parsePluginData(await this.loadData());
		this.register(() => this.stopSignIn());
		this.addSettingTab(
			new SettingsTab(this.app, this, {
				get: () => this.data.settings,
				save: (settings) => this.save({ ...this.data, settings }),
				signedIn: () => signedInDid(this.data.sessions),
				signIn: (account) => this.signIn(account),
				signOut: () => this.signOut(),
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
			await this.save({
				...this.data,
				settings: { ...this.data.settings, account: actor },
			});
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
			new Notice(`Lichen Sync: pull failed. ${reasonOf(err)}`);
		} finally {
			this.pulling = false;
		}
	}
}

function reasonOf(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
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
