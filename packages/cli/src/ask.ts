import { createInterface } from "node:readline/promises";

/** The answer, or `fallback` when it is left empty. */
export type Ask = (question: string, fallback?: string) => Promise<string>;

/**
 * Null when no one can answer: input is not a terminal, an agent runs the command, or --no-input.
 * An agent tool that runs commands in a real terminal still gets questions, so its instructions pass --no-input.
 */
export function terminalAsk(
	env: Readonly<Record<string, string | undefined>>,
	noInput: boolean,
): Ask | null {
	// Claude Code sets CLAUDECODE and CI runners set CI, whatever their terminal.
	const agent = Boolean(env["CLAUDECODE"] || env["CI"]);
	if (noInput || agent || !process.stdin.isTTY || !process.stderr.isTTY) {
		return null;
	}
	return async (question, fallback) => {
		const lines = createInterface({
			input: process.stdin,
			output: process.stderr,
		});
		// The terminal hands Ctrl-C to readline rather than as a signal, so it is stopped here.
		lines.on("SIGINT", () => process.exit(130));
		const shown = fallback ? `${question} (${fallback}): ` : `${question}: `;
		try {
			const answer = (await lines.question(shown)).trim();
			return answer || (fallback ?? "");
		} catch {
			// Input closed before an answer, which reads as leaving it empty.
			return fallback ?? "";
		} finally {
			lines.close();
		}
	};
}
