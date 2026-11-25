import { expect, test } from "bun:test";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	readSessionFile,
	removeSessionFile,
	writeSessionFile,
} from "../src/session-file.ts";

const session = {
	"did:plc:alice": { dpopKey: "key", tokenSet: { sub: "did:plc:alice" } },
} as never;
const file = {
	redirectUri: "http://127.0.0.1:4321/callback",
	sessions: session,
};

async function configDir() {
	return join(await mkdtemp(join(tmpdir(), "lichen-")), "lichen");
}

test("keeps the session and its redirect, readable by the owner alone", async () => {
	const dir = await configDir();

	await writeSessionFile(dir, file);

	expect(await readSessionFile(dir)).toEqual(file);
	expect((await stat(dir)).mode & 0o777).toBe(0o700);
	expect((await stat(join(dir, "session.json"))).mode & 0o777).toBe(0o600);
});

test("reads as signed out when missing, removed, unreadable or of another version", async () => {
	const dir = await configDir();
	expect(await readSessionFile(dir)).toBeNull();

	await writeSessionFile(dir, file);
	await removeSessionFile(dir);
	expect(await readSessionFile(dir)).toBeNull();

	const path = join(dir, "session.json");
	await writeFile(path, "{ not json");
	expect(await readSessionFile(dir)).toBeNull();

	await writeSessionFile(dir, file);
	const saved = JSON.parse(await readFile(path, "utf8"));
	await writeFile(path, JSON.stringify({ ...saved, version: 2 }));
	expect(await readSessionFile(dir)).toBeNull();
});
