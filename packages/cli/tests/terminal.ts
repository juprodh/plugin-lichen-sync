import type { Ask } from "../src/ask.ts";
import { run, type Terminal } from "../src/run.ts";

/** Runs `lichen` with `args`, answering questions from `answers` in order, or with no one to ask. */
export async function lichen(
	args: string[],
	options: Partial<Terminal> & { answers?: string[] } = {},
) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const asked: string[] = [];
	const answers = options.answers ? [...options.answers] : null;
	const ask: Ask | null = answers
		? async (question, fallback) => {
				asked.push(question);
				return answers.shift() || (fallback ?? "");
			}
		: null;
	const code = await run(args, {
		stdout: { write: (text: string) => stdout.push(text) },
		stderr: { write: (text: string) => stderr.push(text) },
		stdoutIsTerminal: false,
		env: {},
		cwd: "/nowhere",
		ask,
		...options,
	});
	return { code, stdout: stdout.join(""), stderr: stderr.join(""), asked };
}
