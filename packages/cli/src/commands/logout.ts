import { signedInDid } from "@lichen-wiki/sync/oauth";
import type { Command } from "../command.ts";
import { cliOAuth } from "../login.ts";
import {
	configDir,
	readSessionFile,
	removeSessionFile,
} from "../session-file.ts";

export const logout: Command = {
	usage: "logout",
	summary: "Sign out, ending the session on your PDS.",
	options: {},
	async run({ out, env }) {
		const dir = configDir(env);
		const file = await readSessionFile(dir);
		const did = file && signedInDid(file.sessions);
		if (file && did) {
			try {
				await cliOAuth(dir, file).revoke(did);
			} catch (err) {
				const reason = err instanceof Error ? err.message : String(err);
				out.note(
					`${out.paint("yellow", "!")} Your PDS did not end the session, which expires on its own. ${reason}`,
				);
			}
		}
		await removeSessionFile(dir);
		out.line(did ? `${out.paint("green", "✓")} Signed out` : "Not signed in.");
		out.data({ signedOut: did ?? null });
		return 0;
	},
};
