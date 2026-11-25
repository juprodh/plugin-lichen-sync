import { describeProblem } from "@lichen-wiki/client/problems";
import { plural } from "./plural.ts";
import type { PullReport } from "./pull.ts";
import type { PushReport } from "./push.ts";

/** One notice for a wiki's sync: what changed, then what needs the user, each on its own line. */
export function describeSync(
	label: string,
	pull: PullReport,
	push: PushReport | null,
): string {
	const updated = pull.written.length + pull.merged.length;
	const pushed = push ? push.pushed.length + push.created.length : 0;
	const counts = [`${notes(updated)} updated`];
	if (pull.deleted.length > 0)
		counts.push(`${notes(pull.deleted.length)} removed`);
	if (push) counts.push(`${notes(pushed)} sent`);
	const lines = [`Lichen Sync: ${label}, ${counts.join(", ")}.`];
	for (const { text, paths } of needsAttention(pull, push)) {
		lines.push(`${text}: ${paths.join(", ")}`);
	}
	for (const { path, problem } of push?.refused ?? []) {
		lines.push(`${path}: ${describeProblem(problem, "en")}`);
	}
	return lines.join("\n");
}

/** What a sync leaves for the user, apart from refused files, each worded with the paths it names. */
export function needsAttention(
	pull: PullReport,
	push: PushReport | null,
): { text: string; paths: readonly string[] }[] {
	const found = [
		{
			text: "Edited here and on lichen.wiki at once; your version is in",
			paths: pull.conflictCopies,
		},
		{
			text: "Found without sync state; the earlier text is in",
			paths: pull.recoveredCopies,
		},
		{
			text: "Deleted on lichen.wiki after an edit here; your version is in",
			paths: pull.deletedCopies,
		},
		{ text: "No longer on lichen.wiki, left as is", paths: pull.gone },
	];
	if (push) {
		found.push(
			{
				text: "Changed on lichen.wiki meanwhile; sync again to merge and send",
				paths: [...push.behind, ...push.lost],
			},
			{
				text: "Sent, not yet shown by lichen.wiki; the next sync checks",
				paths: push.pending,
			},
			{ text: "A note of this wiki already has the title", paths: push.taken },
			{
				text: "Moved or deleted here, unchanged on lichen.wiki",
				paths: push.missing,
			},
			{
				text: "New, held back while a synced file is missing",
				paths: push.heldBack,
			},
		);
	}
	return found.filter(({ paths }) => paths.length > 0);
}

function notes(count: number): string {
	return `${count} ${plural("note", count)}`;
}
