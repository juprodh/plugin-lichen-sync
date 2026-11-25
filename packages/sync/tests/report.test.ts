import { expect, test } from "bun:test";
import type { PullReport } from "../src/pull.ts";
import type { PushReport } from "../src/push.ts";
import { describeSync } from "../src/report.ts";

const pull: PullReport = {
	written: ["w/a.md"],
	merged: [],
	conflictCopies: [],
	recoveredCopies: [],
	gone: [],
};

const push: PushReport = {
	pushed: ["w/b.md"],
	created: ["w/c.md"],
	behind: [],
	lost: [],
	pending: [],
	taken: [],
	refused: [],
	moved: [],
	missing: [],
	heldBack: [],
};

test("a pull-only wiki reports what it updated", () => {
	expect(describeSync("Garden", pull, null)).toBe(
		"Lichen Sync: Garden, 1 note updated.",
	);
});

test("a push reports edits and new notes together", () => {
	expect(describeSync("Garden", pull, push)).toBe(
		"Lichen Sync: Garden, 1 note updated, 2 notes sent.",
	);
});

test("each thing needing the user gets its own line", () => {
	const text = describeSync("Garden", pull, {
		...push,
		lost: ["w/b.md"],
		refused: [
			{ path: "w/long.md", problem: { code: "noteTitleTooLong", max: 300 } },
		],
	});
	expect(text.split("\n")).toEqual([
		"Lichen Sync: Garden, 1 note updated, 2 notes sent.",
		"Changed on lichen.wiki meanwhile; sync again to merge and send: w/b.md",
		"w/long.md: Title is too long (max 300 characters).",
	]);
});
