import { styleText } from "node:util";

type Style = Parameters<typeof styleText>[0];

export interface Writer {
	write(text: string): unknown;
}

/** Results go to stdout and everything else to stderr, so a pipe or an agent reads results alone. */
export class Output {
	constructor(
		private readonly stdout: Writer,
		private readonly stderr: Writer,
		readonly json: boolean,
		private readonly color: boolean,
	) {}

	paint(style: Style, text: string): string {
		// The caller already decided, so styleText must not check the stream again.
		return this.color
			? styleText(style, text, { validateStream: false })
			: text;
	}

	/** A result line, left out under --json, where `data` carries the result. */
	line(text = ""): void {
		if (!this.json) this.stdout.write(`${text}\n`);
	}

	data(value: unknown): void {
		if (this.json) this.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
	}

	note(text: string): void {
		this.stderr.write(`${text}\n`);
	}

	error(text: string): void {
		this.stderr.write(`${this.paint("red", "✗")} ${text}\n`);
	}
}

export function wantsColor(
	env: Readonly<Record<string, string | undefined>>,
	isTerminal: boolean,
	flags: { json: boolean; noColor: boolean },
): boolean {
	if (flags.json || flags.noColor || env["NO_COLOR"]) return false;
	return Boolean(env["FORCE_COLOR"]) || isTerminal;
}
