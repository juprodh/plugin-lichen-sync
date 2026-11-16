import { asRecord } from "./json.ts";
import { parseSessions, type Sessions } from "./oauth.ts";
import { parseSettings, type Settings } from "./settings.ts";
import { parseSyncState, type SyncState } from "./sync-state.ts";

/** The whole of data.json. */
export interface PluginData {
	readonly settings: Settings;
	readonly sync: SyncState;
	readonly sessions: Sessions;
}

// data.json holds whatever an older version or a hand edit left there.
export function parsePluginData(data: unknown): PluginData {
	const raw = asRecord(data);
	return {
		settings: parseSettings(raw["settings"]),
		sync: parseSyncState(raw["sync"]),
		sessions: parseSessions(raw["sessions"]),
	};
}
