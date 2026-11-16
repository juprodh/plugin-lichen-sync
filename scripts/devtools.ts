// Drives the Obsidian that scripts/obsidian.sh opened, through its DevTools port.
const USAGE = `usage:
  bun scripts/devtools.ts eval '<js>'        evaluate in the app window (awaits promises), print the result
  bun scripts/devtools.ts screenshot <file>  save the window as a PNG
  bun scripts/devtools.ts logs               stream console output until interrupted`;

const port = process.env["DEVTOOLS_PORT"] ?? "9222";
const [command, arg] = process.argv.slice(2);

interface Target {
	type: string;
	url: string;
	webSocketDebuggerUrl: string;
}

const targets = (await fetch(`http://127.0.0.1:${port}/json`).then((res) =>
	res.json(),
)) as Target[];
const app = targets.find(
	(t) => t.type === "page" && t.url.startsWith("app://"),
);
if (!app) {
	console.error(
		`No Obsidian window on port ${port}: is scripts/obsidian.sh running?`,
	);
	process.exit(1);
}

const socket = new WebSocket(app.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
	socket.onopen = resolve;
	socket.onerror = reject;
});

let nextId = 0;
const pending = new Map<number, (message: CdpMessage) => void>();

interface CdpMessage {
	id?: number;
	method?: string;
	params?: Record<string, unknown>;
	result?: Record<string, unknown>;
	error?: { message: string };
}

socket.onmessage = (event) => {
	const message = JSON.parse(String(event.data)) as CdpMessage;
	if (message.id !== undefined) pending.get(message.id)?.(message);
	else if (message.method === "Runtime.consoleAPICalled") {
		const { type, args } = message.params as {
			type: string;
			args: { value?: unknown; description?: string }[];
		};
		console.log(`[${type}]`, ...args.map((a) => a.value ?? a.description));
	}
};

function send(
	method: string,
	params: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
	const id = nextId++;
	socket.send(JSON.stringify({ id, method, params }));
	return new Promise((resolve, reject) => {
		pending.set(id, (message) => {
			pending.delete(id);
			if (message.error) reject(new Error(message.error.message));
			else resolve(message.result ?? {});
		});
	});
}

switch (command) {
	case "eval": {
		if (!arg) break;
		const { result, exceptionDetails } = (await send("Runtime.evaluate", {
			expression: arg,
			// Allows top-level await, as in the DevTools console.
			replMode: true,
			awaitPromise: true,
			returnByValue: true,
		})) as {
			result: { value?: unknown; description?: string };
			exceptionDetails?: { exception?: { description?: string } };
		};
		if (exceptionDetails) {
			console.error(
				exceptionDetails.exception?.description ?? exceptionDetails,
			);
			process.exit(1);
		}
		console.log(
			result.value === undefined
				? (result.description ?? "undefined")
				: JSON.stringify(result.value, null, 2),
		);
		process.exit(0);
		break;
	}
	case "screenshot": {
		if (!arg) break;
		const { data } = (await send("Page.captureScreenshot")) as { data: string };
		await Bun.write(arg, Buffer.from(data, "base64"));
		process.exit(0);
		break;
	}
	case "logs":
		await send("Runtime.enable");
		await new Promise(() => {});
}
console.error(USAGE);
process.exit(1);
