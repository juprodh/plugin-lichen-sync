import { mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseSessions, type Sessions } from "@lichen-wiki/sync/oauth";
import { readJsonFile, writeJsonFile } from "./json-file.ts";

const VERSION = 1;
const FILE = "session.json";

/** What a sign-in leaves: the session, and the redirect it was made with, which names the OAuth client a refresh presents again. */
export interface SessionFile {
	readonly redirectUri: string;
	readonly sessions: Sessions;
}

export function configDir(env: Readonly<Record<string, string | undefined>>) {
	return join(env["XDG_CONFIG_HOME"] || join(homedir(), ".config"), "lichen");
}

/** Null when signed out; a file of another version or unreadable also reads as signed out, and the next sign-in replaces it. */
export async function readSessionFile(
	dir: string,
): Promise<SessionFile | null> {
	let raw: Record<string, unknown> | null;
	try {
		raw = await readJsonFile(join(dir, FILE));
	} catch (err) {
		if (err instanceof SyntaxError) return null;
		throw err;
	}
	const redirectUri = raw?.["redirectUri"];
	if (!raw || raw["version"] !== VERSION || typeof redirectUri !== "string") {
		return null;
	}
	return { redirectUri, sessions: parseSessions(raw["sessions"]) };
}

// Owner-only, since it holds the tokens and the key that sign the account's writes.
export async function writeSessionFile(
	dir: string,
	file: SessionFile,
): Promise<void> {
	await mkdir(dir, { recursive: true, mode: 0o700 });
	await writeJsonFile(join(dir, FILE), { version: VERSION, ...file }, 0o600);
}

export async function removeSessionFile(dir: string): Promise<void> {
	await rm(join(dir, FILE), { force: true });
}
