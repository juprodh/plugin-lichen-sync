import { setTimeout as sleep } from "node:timers/promises";
import { wikiSlugFrom } from "@lichen-wiki/client/check";
import { describeProblem } from "@lichen-wiki/client/problems";
import { LICHEN_ORIGIN } from "@lichen-wiki/sync/appview";
import { createWiki, type NewWikiFields } from "@lichen-wiki/sync/new-wiki";
import { accountHandle, requireAccount } from "../account.ts";
import type { Ask } from "../ask.ts";
import type { Command } from "../command.ts";

export const newWiki: Command = {
	usage: "new [name] [--slug address] [--description text] [--language code]",
	summary:
		"Create a public wiki on Lichen, empty: lichen sync then fills it from a folder.",
	options: {
		slug: { type: "string" },
		description: { type: "string" },
		language: { type: "string" },
	},
	async run({ out, ask, env, appview, pds }, { values, positionals }) {
		const account = await requireAccount(env);
		const client = await pds(account);
		const handle = await accountHandle(client, account.did);
		const owner = handle ?? account.did;
		const typed = {
			name: positionals.join(" "),
			slug: values["slug"] as string | undefined,
			description: values["description"] as string | undefined,
			language: values["language"] as string | undefined,
		};
		const fields = ask
			? await askMissing(ask, typed, owner)
			: {
					name: typed.name,
					slug: typed.slug ?? "",
					language: typed.language ?? systemLanguage(),
					description: typed.description ?? "",
				};

		const outcome = await createWiki(
			appview,
			client,
			{ did: account.did, handle },
			fields,
			{ sleep },
		);
		if ("problem" in outcome)
			throw new Error(describeProblem(outcome.problem, "en"));

		const { wiki, seen } = outcome;
		const ref = `@${owner}/${wiki.slug}`;
		out.line(
			`${out.paint("green", "✓")} Created ${out.paint("bold", wiki.name)}: ${LICHEN_ORIGIN}/${ref}`,
		);
		out.note(`Fill it from a folder: lichen sync ${ref}`);
		if (!seen) {
			out.note(
				`${out.paint("yellow", "!")} lichen.wiki has not shown it yet. If the first sync fails, run it again in a minute.`,
			);
		}
		out.data({ wiki, seen });
		return 0;
	},
};

/** What the options gave, the name from the arguments. */
interface Typed {
	readonly name: string;
	readonly slug: string | undefined;
	readonly description: string | undefined;
	readonly language: string | undefined;
}

async function askMissing(
	ask: Ask,
	typed: Typed,
	owner: string,
): Promise<NewWikiFields> {
	const name = typed.name || (await ask("Name"));
	const language = typed.language ?? (await ask("Language", systemLanguage()));
	const slug =
		typed.slug ??
		(await ask(
			`Address: lichen.wiki/@${owner}/`,
			wikiSlugFrom({ name }) || undefined,
		));
	const description =
		typed.description ?? (await ask("Description (Enter to skip)"));
	return { name, slug, language, description };
}

function systemLanguage(): string {
	const { locale } = Intl.DateTimeFormat().resolvedOptions();
	return new Intl.Locale(locale).language;
}
