import { isActorIdentifier, isDid } from "@atcute/lexicons/syntax";
import { bareActor } from "@lichen-wiki/sync/identity";
import type { Command } from "../command.ts";
import { openBrowser, signIn } from "../login.ts";
import { configDir } from "../session-file.ts";

export const login: Command = {
	usage: "login [handle]",
	summary: "Sign in with your Atmosphere account, in the browser.",
	options: {},
	async run({ out, ask, env }, { positionals }) {
		const typed =
			positionals[0] ??
			(ask ? await ask("Your handle (alice.bsky.social)") : "");
		const actor = bareActor(typed);
		if (!isActorIdentifier(actor)) {
			throw new Error(
				typed
					? `Not a handle or a DID: "${typed}"`
					: "Name your account: lichen login alice.bsky.social",
			);
		}
		const did = await signIn(configDir(env), actor, (url) => {
			out.note(
				`Sign in in your browser. If it did not open, visit:\n${url.href}`,
			);
			openBrowser(url);
		});
		const handle = isDid(actor) ? null : actor;
		out.line(
			`${out.paint("green", "✓")} Signed in as ${out.paint("bold", handle ?? did)}`,
		);
		out.data({ did, handle });
		return 0;
	},
};
