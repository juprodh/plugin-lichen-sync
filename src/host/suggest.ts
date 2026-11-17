import { AbstractInputSuggest, type App } from "obsidian";
import { debounced } from "../core/debounce.ts";
import { type Actor, actorQuery, searchActors } from "../core/suggest.ts";

export const DEBOUNCE_MS = 250;

/** Suggests handles under a text field. */
export class ActorSuggest extends AbstractInputSuggest<Actor> {
	private readonly lookUp = debounced(async (value: string) => {
		const query = actorQuery(value);
		return query ? searchActors(query).catch(() => []) : [];
	}, DEBOUNCE_MS);

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

/** A suggestion row in Obsidian's own layout: title over a note, a flair on the right. */
export function renderRow(
	el: HTMLElement,
	row: { avatar: string | null; title: string; note: string; aux?: string },
): void {
	el.addClass("mod-complex", "lichen-sync-suggestion");
	if (row.avatar) {
		el.createEl("img", {
			cls: "lichen-sync-avatar",
			attr: { src: row.avatar, alt: "" },
		});
	}
	const content = el.createDiv({ cls: "suggestion-content" });
	content.createDiv({ cls: "suggestion-title", text: row.title });
	content.createDiv({ cls: "suggestion-note", text: row.note });
	if (row.aux) {
		el.createDiv({ cls: "suggestion-aux" }).createSpan({
			cls: "suggestion-flair",
			text: row.aux,
		});
	}
}
