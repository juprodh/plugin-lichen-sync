import DiffMatchPatch from "diff-match-patch";

const dmp = new DiffMatchPatch();
// Exact context only, found wherever local edits moved it: a fuzzy match could
// land a remote change in the wrong place, which is worse than a conflict copy.
dmp.Match_Threshold = 0.01;
dmp.Match_Distance = 1_000_000_000;
dmp.Patch_DeleteThreshold = 0;

/** Both sides' changes since `base` in one text, or null when they overlap. */
export function mergeText(
	base: string,
	local: string,
	remote: string,
): string | null {
	if (local === base || local === remote) return remote;
	if (remote === base) return local;
	const [merged, applied] = dmp.patch_apply(
		dmp.patch_make(base, remote),
		local,
	);
	return applied.every(Boolean) ? merged : null;
}
