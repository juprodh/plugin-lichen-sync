import { resolveOwner } from "@lichen-wiki/sync/identity";
import { plural } from "@lichen-wiki/sync/plural";
import {
	bookmarkedWikis,
	findWikis,
	type WikiChoice,
	wikisOf,
	yourWikis,
} from "@lichen-wiki/sync/wiki-search";
import { accountPds, requireAccount, savedAccount } from "../account.ts";
import type { Command } from "../command.ts";
import type { Output } from "../output.ts";

export const list: Command = {
	usage: "list [@owner | --bookmarks | --all [words]]",
	summary:
		"List your wikis, an owner's, the ones you bookmarked, or every public wiki (newest first, or matching words).",
	options: {
		all: { type: "boolean" },
		bookmarks: { type: "boolean" },
	},
	async run({ out, env, appview }, { values, positionals }) {
		let wikis: WikiChoice[];
		if (values["all"]) {
			const account = await savedAccount(env);
			const yours = account ? await yourWikis(appview, account.did) : [];
			wikis = await findWikis(appview, positionals.join(" "), yours);
		} else if (values["bookmarks"]) {
			const account = await requireAccount(env);
			wikis = await bookmarkedWikis(
				appview,
				await accountPds(account),
				account.did,
			);
		} else if (positionals[0]) {
			const account = await savedAccount(env);
			const yours = account ? await yourWikis(appview, account.did) : [];
			const owner = await resolveOwner(positionals[0]);
			wikis = await wikisOf(appview, owner, yours);
		} else {
			wikis = await yourWikis(appview, (await requireAccount(env)).did);
		}

		for (const wiki of wikis) out.line(describe(out, wiki));
		if (wikis.length === 0) out.note("No wikis found.");
		out.data(wikis);
		return 0;
	},
};

/** The `@owner/slug` that `lichen sync` takes, then what a person reads. */
function describe(out: Output, wiki: WikiChoice): string {
	const ref = `@${wiki.ownerHandle ?? wiki.ownerDid}/${wiki.slug}`;
	const details = [`${wiki.noteCount} ${plural("note", wiki.noteCount)}`];
	if (wiki.role) details.push(wiki.role);
	return `${ref}  ${out.paint("bold", wiki.name)}  ${out.paint("dim", details.join(" · "))}`;
}
