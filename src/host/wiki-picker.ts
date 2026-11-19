import type { Client } from "@atcute/client";
import {
	type Did,
	isActorIdentifier,
	type ResourceUri,
} from "@atcute/lexicons/syntax";
import { type App, Platform, SuggestModal } from "obsidian";
import { debounced } from "../core/debounce.ts";
import { folderName } from "../core/folders.ts";
import { type Actor, actorQuery } from "../core/handle-suggest.ts";
import { bareActor, resolveOwner } from "../core/identity.ts";
import { plural } from "../core/plural.ts";
import {
	findWikis,
	matchWikis,
	mergeWikis,
	parseWikiRef,
	type WikiChoice,
	wikiAt,
	wikisOf,
	yourWikis,
} from "../core/wiki-search.ts";
import { DEBOUNCE_MS, findActors, renderActor } from "./handle-suggest.ts";
import { sleep } from "./sleep.ts";
import { renderRow } from "./suggestion-row.ts";

type PickerItem =
	| { readonly kind: "wiki"; readonly wiki: WikiChoice }
	| { readonly kind: "sign-in" }
	| {
			readonly kind: "account";
			readonly actor: Actor | null;
			readonly handle: string;
	  };

interface PickerContext {
	readonly appview: Client;
	readonly account: Did | undefined;
	/** The folder a wiki already syncs into. */
	syncedFolder(uri: ResourceUri): string | undefined;
	onPick(wiki: WikiChoice): void;
	onSignIn(handle: string): Promise<void>;
}

const SEARCH_HINT = "Search wikis, or paste a lichen.wiki link";
const SIGN_IN_ITEM: PickerItem = { kind: "sign-in" };

/** One search box over your wikis and lichen.wiki's, which also takes a link and signs you in. */
export class WikiPickerModal extends SuggestModal<PickerItem> {
	private readonly yours: Promise<WikiChoice[]>;
	private signingIn = false;
	// Filtering a held list goes through it too, so a late lookup never replaces a newer answer.
	private readonly find = debounced(
		(query: string) =>
			this.signingIn ? this.findAccount(query) : this.findWiki(query),
		() => sleep(DEBOUNCE_MS),
	);

	constructor(
		app: App,
		private readonly context: PickerContext,
	) {
		super(app);
		this.yours = context.account
			? yourWikis(context.appview, context.account).catch(() => [])
			: Promise.resolve([]);
		this.wikiMode();
		this.inputEl.addEventListener("keydown", (evt) => {
			if (evt.key === "Backspace" && this.signingIn && !this.inputEl.value) {
				evt.preventDefault();
				this.wikiMode();
				this.restart();
			}
		});
	}

	override getSuggestions(query: string): Promise<PickerItem[]> {
		return this.find(query);
	}

	override renderSuggestion(item: PickerItem, el: HTMLElement): void {
		switch (item.kind) {
			case "sign-in":
				renderRow(el, {
					avatar: null,
					title: "Sign in",
					note: "To see your wikis and send your edits. Public wikis need no account.",
				});
				return;
			case "account":
				if (item.actor) renderActor(el, item.actor);
				else {
					renderRow(el, {
						avatar: null,
						title: `@${item.handle}`,
						note: "Sign in as this handle",
					});
				}
				return;
			case "wiki": {
				const { wiki } = item;
				const folder = this.context.syncedFolder(wiki.uri);
				const notes = `${wiki.noteCount} ${plural("note", wiki.noteCount)}`;
				renderRow(el, {
					avatar: null,
					title: wiki.name,
					note: `@${wiki.ownerHandle ?? wiki.ownerDid}/${wiki.slug}`,
					aux:
						folder === undefined
							? `${wiki.role ?? "read only"} · ${notes}`
							: `syncs into ${folderName(folder)}`,
				});
			}
		}
	}

	override selectSuggestion(
		item: PickerItem,
		evt: MouseEvent | KeyboardEvent,
	): void {
		if (item.kind === "sign-in") {
			this.accountMode();
			this.restart();
			return;
		}
		super.selectSuggestion(item, evt);
	}

	override onChooseSuggestion(item: PickerItem): void {
		if (item.kind === "wiki") this.context.onPick(item.wiki);
		if (item.kind === "account") void this.context.onSignIn(item.handle);
	}

	private async findWiki(query: string): Promise<PickerItem[]> {
		const { appview, account } = this.context;
		const ref = parseWikiRef(query);
		if (ref?.slug) {
			const wiki = await wikiAt(appview, ref.actor, ref.slug, account).catch(
				() => null,
			);
			return wiki ? [wikiItem(wiki)] : [];
		}
		if (ref) {
			const owner = await resolveOwner(ref.actor).catch(() => null);
			if (!owner) return [];
			const wikis = await wikisOf(appview, owner, await this.yours).catch(
				() => [],
			);
			return wikis.map(wikiItem);
		}
		const yours = await this.yours;
		// An instance with no wiki search answers MethodNotImplemented: your own wikis still list.
		const found = await findWikis(appview, query, yours).catch(() => []);
		const wikis = mergeWikis(matchWikis(yours, query), found).map(wikiItem);
		return account || query.trim() || Platform.isMobile
			? wikis
			: [SIGN_IN_ITEM, ...wikis];
	}

	private async findAccount(query: string): Promise<PickerItem[]> {
		const typed = bareActor(query);
		const people = actorQuery(query);
		const actors = people ? await findActors(people).catch(() => []) : [];
		const items: PickerItem[] = actors.map((actor) => ({
			kind: "account",
			actor,
			handle: actor.handle,
		}));
		// The index only suggests: any handle or DID signs in.
		if (isActorIdentifier(typed) && !actors.some((a) => a.handle === typed)) {
			items.push({ kind: "account", actor: null, handle: typed });
		}
		return items;
	}

	private wikiMode(): void {
		this.signingIn = false;
		this.setPlaceholder(SEARCH_HINT);
		this.emptyStateText = `No wiki found. ${SEARCH_HINT}.`;
		this.setInstructions([
			{ command: "↑↓", purpose: "to navigate" },
			{ command: "↵", purpose: "to choose" },
			{ command: "esc", purpose: "to dismiss" },
		]);
	}

	private accountMode(): void {
		this.signingIn = true;
		this.setPlaceholder("Your handle, as alice.bsky.social");
		this.emptyStateText = "Type your handle.";
		this.setInstructions([
			{ command: "↵", purpose: "to sign in in your browser" },
			{ command: "⌫", purpose: "back to wikis" },
		]);
	}

	private restart(): void {
		this.inputEl.value = "";
		this.inputEl.dispatchEvent(new Event("input"));
	}
}

function wikiItem(wiki: WikiChoice): PickerItem {
	return { kind: "wiki", wiki };
}
