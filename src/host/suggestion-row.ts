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
