import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { ActorIdentifier, Did } from "@atcute/lexicons/syntax";
import type { OAuthClient } from "@atcute/oauth-node-client";
import { syncPluginClientMetadata } from "@lichen-wiki/client/sync-plugin-oauth";
import { LICHEN_ORIGIN } from "@lichen-wiki/sync/appview";
import { lichenOAuth, type PendingSignIns } from "@lichen-wiki/sync/oauth";
import { type SessionFile, writeSessionFile } from "./session-file.ts";

const SIGN_IN_TIMEOUT_MS = 5 * 60_000;

const DONE_PAGE = `<!doctype html><meta charset="utf-8"><title>Lichen</title>
<p>You can close this tab and go back to the terminal.</p>`;

/** The CLI as a loopback OAuth client, whose id is built from the redirect: a later run must name the same one to refresh. */
export function cliOAuth(dir: string, file: SessionFile): OAuthClient {
	let sessions = file.sessions;
	let signIns: PendingSignIns = {};
	return lichenOAuth(
		{
			sessions: {
				get: () => sessions,
				save: (value) => {
					sessions = value;
					return writeSessionFile(dir, { ...file, sessions });
				},
			},
			signIns: {
				get: () => signIns,
				save: async (value) => {
					signIns = value;
				},
			},
		},
		{
			redirect_uris: [file.redirectUri],
			scope: syncPluginClientMetadata(LICHEN_ORIGIN).scope,
		},
	);
}

/** Signs in through the browser, replacing any session already saved. */
export async function signIn(
	dir: string,
	identifier: ActorIdentifier,
	show: (url: URL) => void,
): Promise<Did> {
	const callback = await listenForCallback(SIGN_IN_TIMEOUT_MS);
	try {
		const { redirectUri } = callback;
		const oauth = cliOAuth(dir, { redirectUri, sessions: {} });
		const { url } = await oauth.authorize({
			target: { type: "account", identifier },
			redirectUri,
		});
		show(url);
		const { session } = await oauth.callback(await callback.params, {
			redirectUri,
		});
		return session.did;
	} finally {
		callback.close();
	}
}

/**
 * A server on a free loopback port, answering the one authorization response it waits for.
 * @internal
 */
export async function listenForCallback(timeoutMs: number) {
	const params = Promise.withResolvers<URLSearchParams>();
	const server = createServer((request, response) => {
		const url = new URL(request.url ?? "/", "http://127.0.0.1");
		if (url.pathname !== "/callback") {
			response.writeHead(404).end();
			return;
		}
		response
			.writeHead(200, { "content-type": "text/html; charset=utf-8" })
			.end(DONE_PAGE);
		params.resolve(url.searchParams);
	});
	await new Promise<void>((listening) =>
		server.listen(0, "127.0.0.1", listening),
	);
	const timer = setTimeout(
		() =>
			params.reject(
				new Error(
					`No answer from the browser within ${timeoutMs / 60_000} minutes. Run lichen login again.`,
				),
			),
		timeoutMs,
	);
	const { port } = server.address() as AddressInfo;
	return {
		redirectUri: `http://127.0.0.1:${port}/callback`,
		params: params.promise,
		close: () => {
			clearTimeout(timer);
			server.closeAllConnections();
			server.close();
		},
	};
}

// The URL is printed too, for when no browser opens: a remote shell, or no desktop.
export function openBrowser(url: URL): void {
	const [command, ...args] =
		process.platform === "darwin"
			? ["open", url.href]
			: process.platform === "win32"
				? ["rundll32", "url.dll,FileProtocolHandler", url.href]
				: ["xdg-open", url.href];
	spawn(command as string, args, { stdio: "ignore", detached: true })
		.on("error", () => {})
		.unref();
}
