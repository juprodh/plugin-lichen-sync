import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { ResourceUri } from "@atcute/lexicons/syntax";
import { describeProblem } from "@lichen-wiki/client/problems";
import { getWiki } from "@lichen-wiki/sync/appview";
import { resolveWiki } from "@lichen-wiki/sync/identity";
import type { PullReport } from "@lichen-wiki/sync/pull";
import { pullWiki } from "@lichen-wiki/sync/pull";
import {
	applyPush,
	type PushPlan,
	type PushReport,
	planPush,
} from "@lichen-wiki/sync/push";
import { needsAttention } from "@lichen-wiki/sync/report";
import type { WikiState } from "@lichen-wiki/sync/sync-state";
import { parseWikiRef, yourWikis } from "@lichen-wiki/sync/wiki-search";
import { type Account, savedAccount } from "../account.ts";
import type { Command, Context } from "../command.ts";
import { findLinkedFolder, writeFolderLink } from "../folder-state.ts";
import { folderVault } from "../fs-vault.ts";
import type { Output } from "../output.ts";

// The whole linked folder is the wiki, as a whole-vault wiki is in the plugin.
const FOLDER = "";

type WikiView = NonNullable<Awaited<ReturnType<typeof getWiki>>>;

export const sync: Command = {
	usage: "sync [<wiki>] [-m message]",
	summary:
		"Bring the wiki's changes into this folder, then publish yours. The first sync in a folder links it to <wiki>: @owner/slug or its lichen.wiki link.",
	options: { message: { type: "string", short: "m" } },
	async run(context, { values, positionals }) {
		const { out, appview, env } = context;
		const account = await savedAccount(env);
		const { root, wiki, known } = await linkedWiki(
			context,
			account,
			positionals[0],
		);
		const view = await getWiki(appview, wiki, account?.did);
		if (!view) throw new Error(`lichen.wiki has no public wiki at ${wiki}.`);

		const vault = folderVault(root);
		out.note(`Syncing ${out.paint("bold", wikiLabel(view))} with ${root}`);
		const pulled = await pullWiki(appview, vault, wiki, FOLDER, known);
		await writeFolderLink(root, { wiki, notes: pulled.state });

		const plan = await planPush(vault, FOLDER, pulled.state);
		const { pushed, blocked } = await publish(context, plan, {
			account,
			view,
			root,
			state: pulled.state,
			message: values["message"],
		});

		const attention = needsAttention(pulled.report, pushed);
		const refused = pushed?.refused ?? plan.refused;
		const matches = !blocked && attention.length === 0 && refused.length === 0;
		showResult(out, pulled.report, pushed);
		for (const { text, paths } of attention) {
			out.line(`${out.paint("yellow", "!")} ${text}: ${paths.join(", ")}`);
		}
		for (const { path, problem } of refused) {
			out.line(
				`${out.paint("red", "✗")} ${path}: ${describeProblem(problem, "en")}`,
			);
		}
		if (blocked) out.line(`${out.paint("yellow", "!")} ${blocked}`);
		const label = wikiLabel(view);
		out.line(
			matches
				? `${out.paint("green", "✓")} ${label} and this folder match`
				: `${out.paint("yellow", "!")} ${label} and this folder differ; see above`,
		);
		out.data({
			wiki,
			folder: root,
			pulled: pulled.report,
			pushed,
			refused,
			blocked,
			matches,
		});
		return matches ? 0 : 1;
	},
};

/** Publishes the plan once asked for its message, or says why it cannot. */
async function publish(
	context: Context,
	plan: PushPlan,
	sync: {
		account: Account | null;
		view: WikiView;
		root: string;
		state: WikiState;
		message: string | boolean | undefined;
	},
): Promise<{ pushed: PushReport | null; blocked: string | null }> {
	const { account, view, root, state } = sync;
	const writes = plan.edits.length + plan.notes.length + plan.moves.length;
	if (writes === 0) return { pushed: null, blocked: null };
	if (!account) {
		return {
			pushed: null,
			blocked: "Sign in to publish your edits: lichen login",
		};
	}
	if (!view.viewer?.canWrite) {
		const blocked = `You cannot edit ${wikiLabel(view)}; its owner can add you on lichen.wiki.`;
		return { pushed: null, blocked };
	}

	showPlan(context.out, plan);
	const message = await editMessage(context, sync.message);
	const result = await applyPush(
		context.appview,
		await context.pds(account),
		account.did,
		view.uri,
		state,
		plan,
		{ sleep },
		message,
	);
	await writeFolderLink(root, { wiki: view.uri, notes: result.state });
	return { pushed: result.report, blocked: null };
}

function wikiLabel(view: WikiView): string {
	return `@${view.ownerHandle ?? view.did}/${view.slug}`;
}

/** The folder's wiki, linking the current folder when it has none and `typed` names one. */
async function linkedWiki(
	{ out, ask, appview, cwd }: Context,
	account: Account | null,
	typed: string | undefined,
): Promise<{ root: string; wiki: ResourceUri; known: WikiState }> {
	const linked = await findLinkedFolder(cwd);
	if (linked) {
		const { root, link } = linked;
		if (typed && (await resolveTyped(typed)) !== link.wiki) {
			throw new Error(`${root} already syncs with ${link.wiki}.`);
		}
		return { root, wiki: link.wiki, known: link.notes };
	}

	const root = resolve(cwd);
	// Linking takes every markdown file below it into the wiki, which from a home folder or the root would be most of the disk.
	if (root === homedir() || dirname(root) === root) {
		throw new Error(
			`Run lichen sync in the folder for the wiki, not in ${root}.`,
		);
	}
	const wiki = typed
		? await resolveTyped(typed)
		: await chooseWiki(out, ask, appview, account);
	out.note(`Linking ${root} to ${wiki}`);
	return { root, wiki, known: {} };
}

async function resolveTyped(typed: string): Promise<ResourceUri> {
	const ref = parseWikiRef(typed);
	if (!ref?.slug) {
		throw new Error(
			`Name a wiki as @owner/slug, or paste its lichen.wiki link: "${typed}"`,
		);
	}
	return resolveWiki(ref.actor, ref.slug);
}

async function chooseWiki(
	out: Output,
	ask: Context["ask"],
	appview: Context["appview"],
	account: Account | null,
): Promise<ResourceUri> {
	const hint =
		"This folder syncs with no wiki yet. Name one: lichen sync @owner/slug (lichen list shows yours, lichen new creates one)";
	if (!ask || !account) throw new Error(hint);
	const wikis = await yourWikis(appview, account.did);
	if (wikis.length === 0) throw new Error(hint);
	wikis.forEach((wiki, i) => {
		out.note(
			`  ${i + 1}. @${wiki.ownerHandle ?? wiki.ownerDid}/${wiki.slug}  ${wiki.name}`,
		);
	});
	const answer = await ask(
		"Which wiki does this folder sync with? Its number or @owner/slug",
	);
	const picked = wikis[Number(answer) - 1];
	return picked ? picked.uri : resolveTyped(answer);
}

function showResult(
	out: Output,
	pulled: PullReport,
	pushed: PushReport | null,
): void {
	const row = (style: "cyan" | "green", symbol: string, path: string) =>
		out.line(`${out.paint(style, symbol)} ${path}`);
	for (const path of pulled.written) row("cyan", "↓", path);
	for (const path of pulled.merged)
		row("cyan", "↓", `${path} (merged with your edits)`);
	for (const path of pulled.deleted)
		row("cyan", "↓", `${path} (deleted on lichen.wiki)`);
	for (const path of pushed?.pushed ?? []) row("green", "↑", path);
	for (const path of pushed?.created ?? []) row("green", "↑", `${path} (new)`);
	for (const path of pushed?.moved ?? []) row("green", "→", path);
}

function showPlan(out: Output, plan: PushPlan): void {
	out.note("To publish:");
	for (const { synced } of plan.edits)
		out.note(`  ${out.paint("green", "~")} ${synced.path}`);
	for (const { path } of plan.notes)
		out.note(`  ${out.paint("green", "+")} ${path}`);
	for (const { synced, path } of plan.moves) {
		out.note(`  ${out.paint("green", "→")} ${synced.path} → ${path}`);
	}
}

// A blank message is left out, and lichen.wiki then shows its own label, in the reader's language.
async function editMessage(
	{ ask }: Context,
	typed: string | boolean | undefined,
): Promise<string | undefined> {
	if (typeof typed === "string") return typed;
	return ask ? await ask("Describe your changes (Enter to skip)") : undefined;
}
