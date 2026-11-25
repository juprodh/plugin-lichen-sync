import type { ParseArgsOptionsConfig } from "node:util";
import type { Ask } from "./ask.ts";
import type { Output } from "./output.ts";

export interface Context {
	readonly out: Output;
	readonly ask: Ask | null;
	readonly cwd: string;
	readonly env: Readonly<Record<string, string | undefined>>;
}

interface Parsed {
	readonly values: Readonly<Record<string, string | boolean | undefined>>;
	readonly positionals: readonly string[];
}

export interface Command {
	readonly usage: string;
	readonly summary: string;
	readonly options: ParseArgsOptionsConfig;
	/** The exit code: 0 when the folder and the wiki match after it, 1 otherwise. */
	run(context: Context, args: Parsed): Promise<number>;
}
