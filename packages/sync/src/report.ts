import type { CheckProblem } from "@lichen-wiki/client/check";
import type { NewWikiProblem } from "./new-wiki.ts";
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
	add(pull.gone, "No longer on lichen.wiki, left as is");
	if (!push) return lines.join("\n");
	add(
		[...push.behind, ...push.lost],
		"Changed on lichen.wiki meanwhile; sync again to merge and send",
	);
	add(push.pending, "Sent, not yet shown by lichen.wiki; the next sync checks");
	add(push.taken, "A note of this wiki already has the title");
	for (const { path, problem } of push.refused) {
		lines.push(`${path}: ${describeProblem(problem)}`);
	}
	add(push.missing, "Moved or deleted here, unchanged on lichen.wiki");
	add(push.heldBack, "New, held back while a synced file is missing");
	return lines.join("\n");
}

function notes(count: number): string {
	return `${count} ${plural("note", count)}`;
}

// lichen.wiki's wording (lichen-repo/src/i18n/locales/en.json).
export function describeProblem(
	problem: CheckProblem | NewWikiProblem,
): string {
	switch (problem.code) {
		case "noteTitleRequired":
			return "Title is required.";
		case "noteSlugInvalid":
			return `"${problem.title}" produces an invalid slug. Please use a different title.`;
		case "noteTitleTooLong":
			return `Title is too long (max ${problem.max} characters).`;
		case "revisionContentTooLong":
			return `Content is too long (max ${problem.max} characters).`;
		case "wikiNameRequired":
			return "Wiki name is required.";
		case "wikiNameTooLong":
			return `Wiki name is too long (max ${problem.max} characters).`;
		case "wikiSlugRequired":
			return "That name can't be turned into an address. Please choose one (letters a-z, numbers and hyphens).";
		case "wikiSlugInvalid":
			return `"${problem.slug}" can't be used as an address. Use letters a-z, numbers and hyphens.`;
		case "wikiSlugExists":
			return `You already have a wiki at "${problem.slug}".`;
		case "wikiLanguageRequired":
			return "Language is required.";
		case "wikiLanguageInvalid":
			return "Language must be a valid BCP-47 tag (e.g. en, pt-BR).";
		default:
			return `Lichen would not keep it (${problem.code}).`;
	}
}
