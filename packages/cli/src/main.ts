#!/usr/bin/env node
import { run } from "./run.ts";

// A reader that stops early, as `| head` does, closes the pipe: that ends the command quietly.
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
	if (err.code !== "EPIPE") throw err;
	process.exit();
});

process.exitCode = await run(process.argv.slice(2), {
	stdout: process.stdout,
	stderr: process.stderr,
	stdoutIsTerminal: process.stdout.isTTY === true,
	env: process.env,
	cwd: process.cwd(),
});
