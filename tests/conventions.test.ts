import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

function imports(dir: string): [file: string, spec: string][] {
	return [...new Bun.Glob("**/*.ts").scanSync(join(ROOT, dir))].flatMap(
		(file) =>
			[
				...readFileSync(join(ROOT, dir, file), "utf8").matchAll(
					/(?:\bfrom\s*|^\s*import\s*|\bimport\(\s*)"([^"]+)"/gm,
				),
			].map((m): [string, string] => [`${dir}/${file}`, m[1] as string]),
	);
}

const PLUGIN_API_OR_BUILTIN =
	/^(?:obsidian|electron|@codemirror\/|@lezer\/|[a-z]+:)/;

// The sync logic runs in the plugin and in a terminal, so it reads only its own files and npm.
test("packages/sync/src/ imports neither the plugin, its API nor a runtime's builtins", () => {
	const bad = imports("packages/sync/src").filter(
		([, spec]) => PLUGIN_API_OR_BUILTIN.test(spec) || spec.startsWith("../"),
	);
	expect(bad).toEqual([]);
});

// core/ is the plugin's own logic: free of the plugin API, so it runs in tests.
test("src/core/ imports neither the plugin API nor a runtime's builtins", () => {
	const bad = imports("src/core").filter(
		([, spec]) => PLUGIN_API_OR_BUILTIN.test(spec) || spec.includes("/host/"),
	);
	expect(bad).toEqual([]);
});

test("packages/sync/tests/ import only the package", () => {
	const bad = imports("packages/sync/tests").filter(([, spec]) =>
		spec.startsWith("../../"),
	);
	expect(bad).toEqual([]);
});

// The obsidian package ships types only, so code under bun that loads src/host/ cannot run.
test("tests and scripts import src/ only through src/core/", () => {
	const bad = [...imports("tests"), ...imports("scripts")].filter(
		([, spec]) => spec.includes("/src/") && !spec.includes("/src/core/"),
	);
	expect(bad).toEqual([]);
});
