import type { Saved } from "@lichen-wiki/sync/saved";
import type { App } from "obsidian";

const VAULT_KEY = "lichen-sync-secret-key";

// Obsidian keeps secrets per vault on desktop but for the whole app on mobile, so each id names its vault.
function vaultKey(app: App): string {
	const saved: unknown = app.loadLocalStorage(VAULT_KEY);
	if (typeof saved === "string" && /^[0-9a-f]{16}$/.test(saved)) return saved;
	const bytes = crypto.getRandomValues(new Uint8Array(8));
	const key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
		"",
	);
	app.saveLocalStorage(VAULT_KEY, key);
	return key;
}

/** A JSON value in Obsidian's secret storage, kept on this device for this vault. */
export function vaultSecret<T>(
	app: App,
	name: string,
	parse: (raw: unknown) => T,
): Saved<T> {
	const id = `lichen-sync-${vaultKey(app)}-${name}`;
	let value = parse(readJson(app.secretStorage.getSecret(id)));
	return {
		get: () => value,
		save: (next) => {
			value = next;
			app.secretStorage.setSecret(id, JSON.stringify(next));
			return Promise.resolve();
		},
	};
}

function readJson(secret: string | null): unknown {
	if (!secret) return undefined;
	try {
		return JSON.parse(secret);
	} catch {
		return undefined;
	}
}
