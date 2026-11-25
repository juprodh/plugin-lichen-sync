import { parseArgs } from "node:util";
import type { Client } from "@atcute/client";
import { lichenAppview } from "@lichen-wiki/sync/appview";
import { version } from "../package.json";
import { type Ask, terminalAsk } from "./ask.ts";
import type { Command, Context } from "./command.ts";
import { list } from "./commands/list.ts";
import { login } from "./commands/login.ts";
import { logout } from "./commands/logout.ts";
import { Output, type Writer, wantsColor } from "./output.ts";

export interface Terminal {
	readonly stdout: Writer;
	readonly stderr: Writer;
	readonly stdoutIsTerminal: boolean;
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly cwd: string;
	/** Tests answer questions themselves; null asks the terminal when someone can answer. */
	readonly ask?: Ask | null;
	readonly appview?: Client;
}

const COMMANDS: Readonly<Record<string, Command>> = {
	login,
	logout,
	list,
};

const SHARED = {
	json: { type: "boolean" },
	"no-color": { type: "boolean" },
	"no-input": { type: "boolean" },
	help: { type: "boolean", short: "h" },
} as const;

export async function run(
	argv: readonly string[],
	terminal: Terminal,
): Promise<number> {
	const [name, ...rest] = argv;
	const json = rest.includes("--json");
	const out = new Output(
		terminal.stdout,
		terminal.stderr,
		json,
		wantsColor(terminal.env, terminal.stdoutIsTerminal, {
			json,
			noColor: argv.includes("--no-color"),
		}),
	);

	if (name === "--version" || name === "-v") {
		out.line(version);
		return 0;
	}
	if (name === undefined || name === "--help" || name === "-h") {
		out.line(usage(out));
		return 0;
	}
	const command = COMMANDS[name];
	if (!command) {
		out.error(`Unknown command "${name}". Run lichen --help for the list.`);
		return 1;
	}

	try {
		const { values, positionals } = parseArgs({
			args: [...rest],
			options: { ...SHARED, ...command.options },
			allowPositionals: true,
		});
		if (values.help) {
			out.line(`lichen ${command.usage}\n\n${command.summary}`);
			return 0;
		}
		const context: Context = {
			out,
			ask:
				terminal.ask === undefined
					? terminalAsk(terminal.env, values["no-input"] === true)
					: terminal.ask,
			appview: terminal.appview ?? lichenAppview(),
			cwd: terminal.cwd,
			env: terminal.env,
		};
		return await command.run(context, { values, positionals });
	} catch (err) {
		out.error(err instanceof Error ? err.message : String(err));
		return 1;
	}
}

function usage(out: Output): string {
	const rows = Object.values(COMMANDS).map(
		(command) =>
			`  ${out.paint("bold", `lichen ${command.usage}`)}\n      ${command.summary}`,
	);
	return [
		"Sync a folder of markdown with a Lichen wiki.",
		"",
		...rows,
		"",
		"Every command takes --json, --no-color and --no-input.",
	].join("\n");
}
