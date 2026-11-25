import { expect, test } from "bun:test";
import { mergeText } from "../src/merge.ts";

const base =
	"# Title\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n";

test("takes both sides' edits to separate places", () => {
	const local = base.replace("First", "Opening").concat("Local tail.\n");
	const remote = base.replace("Third", "Closing");
	expect(mergeText(base, local, remote)).toBe(
		"# Title\n\nOpening paragraph.\n\nSecond paragraph.\n\nClosing paragraph.\nLocal tail.\n",
	);
});

test("places a remote edit that a long local insertion moved", () => {
	const local = base.replace(
		"# Title\n",
		`# Title\n\n${"Inserted. ".repeat(200)}\n`,
	);
	const remote = base.replace("Third", "Closing");
	expect(mergeText(base, local, remote)).toBe(
		local.replace("Third", "Closing"),
	);
});

test("refuses edits to the same place", () => {
	const local = base.replace("Second paragraph", "Second, said here");
	const remote = base.replace("Second paragraph", "Second, said there");
	expect(mergeText(base, local, remote)).toBeNull();
});

test("refuses a remote deletion of text edited here", () => {
	const local = base.replace(
		"Second paragraph.",
		"Second paragraph, expanded.",
	);
	const remote = base.replace("Second paragraph.\n\n", "");
	expect(mergeText(base, local, remote)).toBeNull();
});
