import { SIDEBAR_NOTE_SLUG } from "@lichen/client/slug";

// sanitizeFilename and deduplicateFilename mirror lichen-repo
// src/import-export/filenames.ts, so a synced folder names files as an export does.
const INVALID_FILENAME_CHARS = /[/\\:*?"<>|]/g;

function sanitizeFilename(title: string): string {
	return (
		title.replace(INVALID_FILENAME_CHARS, "").trim().slice(0, 200) || "untitled"
	);
}

function deduplicateFilename(name: string, used: ReadonlySet<string>): string {
	if (!used.has(name.toLowerCase())) return name;
	let counter = 2;
	while (used.has(`${name}-${counter}`.toLowerCase())) counter++;
	return `${name}-${counter}`;
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
	const stem = deduplicateFilename(`${folder}/${name}`, used);
	used.add(stem.toLowerCase());
	return `${stem}.md`;
}

export function titleFromPath(path: string): string {
	return stemOf(path.slice(path.lastIndexOf("/") + 1));
}

/** Where a wiki's conflict copies go: beside its folder, since every markdown file in the folder is a note. */
export function conflictsFolder(folder: string): string {
	return `${folder} (conflicts)`;
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
