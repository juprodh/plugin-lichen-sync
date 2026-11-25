import { asRecord } from "@lichen-wiki/sync/json";
import { parseSyncState, type SyncState } from "@lichen-wiki/sync/sync-state";
import { parseSettings, type Settings } from "./settings.ts";

/** The whole of data.json. Sessions live in the host's secret storage instead, since data.json travels with the vault. */
export interface PluginData {
	readonly settings: Settings;
	readonly sync: SyncState;
}

// data.json holds whatever an older version or a hand edit left there.
export function parsePluginData(data: unknown): PluginData {
	const raw = asRecord(data);
	return {
		settings: parseSettings(raw["settings"]),
		sync: parseSyncState(raw["sync"]),
	};
}

/** Whether data.json still holds a session from 0.1's loopback client, which signing in no longer uses. */
export function holdsLoopbackSession(data: unknown): boolean {
	return Object.keys(asRecord(asRecord(data)["sessions"])).length > 0;
}
