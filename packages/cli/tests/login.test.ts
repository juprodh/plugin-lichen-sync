import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listenForCallback } from "../src/login.ts";
import { readSessionFile, writeSessionFile } from "../src/session-file.ts";
import { lichen } from "./terminal.ts";

test("takes the authorization response the browser brings back, and only that", async () => {
	const callback = await listenForCallback(60_000);
	try {
		const elsewhere = new URL("/favicon.ico", callback.redirectUri);
		expect((await fetch(elsewhere)).status).toBe(404);

		const page = await fetch(`${callback.redirectUri}?code=abc&state=xyz`);

		expect(page.status).toBe(200);
		expect(Object.fromEntries(await callback.params)).toEqual({
			code: "abc",
			state: "xyz",
		});
	} finally {
		callback.close();
	}
});

test("gives up when the browser never answers", async () => {
	const callback = await listenForCallback(10);
	try {
		await expect(callback.params).rejects.toThrow("Run lichen login again");
	} finally {
		callback.close();
	}
});

test("asks for the account when no one can be asked, exiting 1", async () => {
	const { code, stderr } = await lichen(["login"]);

	expect(code).toBe(1);
	expect(stderr).toContain("lichen login alice.bsky.social");
});

test("signs out with no session to end, removing the file", async () => {
	const home = await mkdtemp(join(tmpdir(), "lichen-"));
	const dir = join(home, "lichen");
	await writeSessionFile(dir, {
		redirectUri: "http://127.0.0.1:4321/callback",
		sessions: {},
	});

	const { code, stdout } = await lichen(["logout", "--json"], {
		env: { XDG_CONFIG_HOME: home },
	});

	expect(code).toBe(0);
	expect(JSON.parse(stdout)).toEqual({ signedOut: null });
	expect(await readSessionFile(dir)).toBeNull();
});
