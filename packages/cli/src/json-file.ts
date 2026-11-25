import { readFile, rename, writeFile } from "node:fs/promises";
import { asRecord } from "@lichen-wiki/sync/json";

/** The JSON object at `path`, null when there is no file there; text that is no JSON throws a `SyntaxError`. */
export async function readJsonFile(
	path: string,
): Promise<Record<string, unknown> | null> {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (err) {
		if (isMissing(err)) return null;
		throw err;
	}
	return asRecord(JSON.parse(text));
}

// Written beside it, then renamed over it: a reader finds the old file or the new, never part of one.
export async function writeJsonFile(
	path: string,
	value: object,
	mode?: number,
): Promise<void> {
	const partial = `${path}.${process.pid}`;
	const text = `${JSON.stringify(value, null, "\t")}\n`;
	await writeFile(partial, text, mode === undefined ? {} : { mode });
	await rename(partial, path);
}

export function isMissing(err: unknown): boolean {
	return (err as NodeJS.ErrnoException).code === "ENOENT";
}
