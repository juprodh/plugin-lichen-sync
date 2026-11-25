import { expect, test } from "bun:test";
import { version } from "../package.json";
import { Output, wantsColor } from "../src/output.ts";
import { lichen } from "./terminal.ts";

test("prints its version", async () => {
	expect(await lichen(["--version"])).toMatchObject({
		code: 0,
		stdout: `${version}\n`,
	});
});

test("refuses an unknown command on stderr, exiting 1", async () => {
	const { code, stdout, stderr } = await lichen(["frobnicate"]);

	expect(code).toBe(1);
	expect(stdout).toBe("");
	expect(stderr).toContain('Unknown command "frobnicate"');
});

test("colors only a terminal, unless told otherwise", () => {
	const flags = { json: false, noColor: false };
	expect(wantsColor({}, true, flags)).toBe(true);
	expect(wantsColor({}, false, flags)).toBe(false);
	expect(wantsColor({ FORCE_COLOR: "1" }, false, flags)).toBe(true);
	expect(wantsColor({ NO_COLOR: "1" }, true, flags)).toBe(false);
	expect(wantsColor({}, true, { ...flags, noColor: true })).toBe(false);
	expect(wantsColor({ FORCE_COLOR: "1" }, true, { ...flags, json: true })).toBe(
		false,
	);
});

test("under --json, prints the data alone on stdout", () => {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const out = new Output(
		{ write: (text: string) => stdout.push(text) },
		{ write: (text: string) => stderr.push(text) },
		true,
		false,
	);

	out.line("Garden notes");
	out.note("Pulling…");
	out.data({ wikis: 1 });

	expect(JSON.parse(stdout.join(""))).toEqual({ wikis: 1 });
	expect(stderr.join("")).toBe("Pulling…\n");
});
