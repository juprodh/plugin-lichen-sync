import type { Did } from "@atcute/lexicons/syntax";
import { AbstractInputSuggest, type App, requestUrl } from "obsidian";
import { debounced } from "../core/debounce.ts";
import {
	type Actor,
	actorQuery,
	getProfile,
	searchActors,
} from "../core/handle-suggest.ts";
import { sleep } from "./sleep.ts";
import { renderRow } from "./suggestion-row.ts";

export const DEBOUNCE_MS = 250;
const TIMEOUT_MS = 2000;

export function findActors(query: string): Promise<Actor[]> {
	return searchActors(getJson, query);
}

export function findProfile(did: Did): Promise<Actor | null> {
	return getProfile(getJson, did);
}

// requestUrl cannot be cancelled, so a slow answer is left to finish unread.
async function getJson(url: string): Promise<unknown> {
	let timer: number | undefined;
	const timeout = new Promise<null>((resolve) => {
		timer = window.setTimeout(() => resolve(null), TIMEOUT_MS);
	});
	try {
		const response = await Promise.race([
			requestUrl({ url, headers: { "X-Client": "lichen-sync" }, throw: false }),
			timeout,
		]);
		return response && response.status < 300 ? response.json : {};
	} finally {
		window.clearTimeout(timer);
	}
}

/** Suggests handles under a text field. */
export class ActorSuggest extends AbstractInputSuggest<Actor> {
	private readonly lookUp = debounced(
		async (value: string) => {
			const query = actorQuery(value);
			return query ? findActors(query).catch(() => []) : [];
		},
		() => sleep(DEBOUNCE_MS),
	);

	constructor(
		app: App,
		input: HTMLInputElement,
		private readonly onPick: (actor: Actor) => void,
	) {
		super(app, input);
	}

	protected override getSuggestions(value: string): Promise<Actor[]> {
		return this.lookUp(value);
	}

	override renderSuggestion(actor: Actor, el: HTMLElement): void {
		renderActor(el, actor);
	}

	override selectSuggestion(actor: Actor): void {
		this.setValue(actor.handle);
		this.onPick(actor);
		this.close();
	}
}

export function renderActor(el: HTMLElement, actor: Actor, aux?: string): void {
	renderRow(el, {
		avatar: actor.avatar,
		title: actor.displayName ?? actor.handle,
		note: `@${actor.handle}`,
		...(aux ? { aux } : {}),
	});
}
