import {
	deduplicateFilename,
	sanitizeFilename,
} from "@lichen-wiki/client/filenames";
import { SIDEBAR_NOTE_SLUG } from "@lichen-wiki/client/slug";
import { conflictsFolder } from "./folders.ts";

/** `name` in `folder`, where "" is the vault's root. */
function joinPath(folder: string, name: string): string {
	return folder ? `${folder}/${name}` : name;
}

function stemOf(path: string): string {
	return path.replace(/\.md$/, "");
}

/** The lowercased stems of `paths`, as `claimPath` compares them. */
export function usedStems(paths: Iterable<string>): Set<string> {
	return new Set([...paths].map((path) => stemOf(path).toLowerCase()));
}

/** A path for the note in `folder` that no other file takes, then marked taken in `used`. */
export function claimPath(
	folder: string,
	note: { slug: string; title: string },
	used: Set<string>,
): string {
	// Named for the slug, so the sidebar survives a round trip through import.
	const name =
		note.slug === SIDEBAR_NOTE_SLUG
			? SIDEBAR_NOTE_SLUG
			: sanitizeFilename(note.title);
	const stem = deduplicateFilename(joinPath(folder, name), used);
	used.add(stem.toLowerCase());
	return `${stem}.md`;
}

export function titleFromPath(path: string): string {
	return stemOf(path.slice(path.lastIndexOf("/") + 1));
}

/** The `n`th candidate for a copy of the file at `path`, of the wiki synced into `folder`. */
export function conflictCopyPath(
	folder: string,
	path: string,
	n: number,
): string {
	const suffix = n > 1 ? ` ${n}` : "";
	return `${conflictsFolder(folder)}/${titleFromPath(path)}${suffix}.md`;
}
