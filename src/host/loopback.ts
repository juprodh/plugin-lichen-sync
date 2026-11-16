import { LOOPBACK_CALLBACK_PATH, LOOPBACK_PORT } from "../core/oauth.ts";

// The slice of node:http used here; the bundle's types are the browser's, without Node.
interface HttpServer {
	listen(port: number, host: string, onListening: () => void): void;
	once(event: "error", onError: (err: Error) => void): void;
	close(): void;
}
interface NodeHttp {
	createServer(
		onRequest: (
			req: { url?: string },
			res: {
				writeHead(status: number, headers: Record<string, string>): void;
				end(body: string): void;
			},
		) => void,
	): HttpServer;
}

// Electron's own require: the bundler would swap a plain require("node:http") for a browser stub.
function nodeHttp(): NodeHttp {
	const { require } = window as unknown as {
		require?: (id: "node:http") => NodeHttp;
	};
	if (!require) throw new Error("Signing in needs the desktop app for now.");
	return require("node:http");
}

const CALLBACK_TIMEOUT_MS = 5 * 60_000;

// The tokens are only exchanged after this page, so it claims no success.
const DONE_PAGE = `<!doctype html><meta charset="utf-8"><title>Lichen Sync</title>
<p>Back to Obsidian, which finishes signing you in. You can close this tab.</p>`;

const DENIED_PAGE = `<!doctype html><meta charset="utf-8"><title>Lichen Sync</title>
<p>Sign-in to Lichen Sync was not completed. You can close this tab.</p>`;

export interface CallbackListener {
	readonly params: Promise<URLSearchParams>;
	/** Stops listening; a sign-in still waiting fails as cancelled. */
	close(): void;
}

/**
 * Listens on the loopback redirect URI for the authorization server's redirect, and resolves to its
 * query. Desktop only: mobile has no Node to listen with.
 */
export async function listenForCallback(): Promise<CallbackListener> {
	const { promise, resolve, reject } = Promise.withResolvers<URLSearchParams>();
	const server = nodeHttp().createServer((req, res) => {
		const url = new URL(req.url ?? "/", "http://127.0.0.1");
		if (url.pathname !== LOOPBACK_CALLBACK_PATH) {
			res.writeHead(404, { "content-type": "text/plain" });
			res.end("Not found");
			return;
		}
		res.writeHead(200, { "content-type": "text/html" });
		res.end(url.searchParams.has("error") ? DENIED_PAGE : DONE_PAGE);
		resolve(url.searchParams);
		close();
	});
	const timer = setTimeout(() => {
		reject(new Error("Sign-in timed out."));
		close();
	}, CALLBACK_TIMEOUT_MS);
	function close() {
		clearTimeout(timer);
		server.close();
		reject(new Error("Sign-in cancelled."));
	}

	await new Promise<void>((listening, failed) => {
		server.once("error", (err) => {
			clearTimeout(timer);
			failed(
				new Error(
					`Port ${LOOPBACK_PORT} is unavailable for the sign-in callback: ${err.message}`,
				),
			);
		});
		server.listen(LOOPBACK_PORT, "127.0.0.1", listening);
	});
	// A close before anyone awaits params must not surface as an unhandled rejection.
	promise.catch(() => {});
	return { params: promise, close };
}
