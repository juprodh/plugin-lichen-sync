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
	const add = (paths: readonly string[], text: string) => {
		if (paths.length > 0) lines.push(`${text}: ${paths.join(", ")}`);
	};
	add(
		pull.conflictCopies,
		"Edited here and on lichen.wiki at once; your version is in",
	);
	add(pull.recoveredCopies, "Found without sync state; the earlier text is in");
	add(
		pull.deletedCopies,
		"Deleted on lichen.wiki after an edit here; your version is in",
	);
	add(pull.gone, "No longer on lichen.wiki, left as is");
	if (!push) return lines.join("\n");
	add(
		[...push.behind, ...push.lost],
		"Changed on lichen.wiki meanwhile; sync again to merge and send",
	);
	add(push.pending, "Sent, not yet shown by lichen.wiki; the next sync checks");
	add(push.taken, "A note of this wiki already has the title");
	for (const { path, problem } of push.refused) {
		lines.push(`${path}: ${describeProblem(problem, "en")}`);
	}
	add(push.missing, "Moved or deleted here, unchanged on lichen.wiki");
	add(push.heldBack, "New, held back while a synced file is missing");
	return lines.join("\n");
}

function notes(count: number): string {
	return `${count} ${plural("note", count)}`;
}
