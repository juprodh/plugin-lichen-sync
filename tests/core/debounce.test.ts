import { expect, test } from "bun:test";
import { debounced } from "../../src/core/debounce.ts";

test("runs once calls pause, and every call answers with the latest result", async () => {
	const seen: string[] = [];
	const find = debounced(
		async (query: string) => {
			seen.push(query);
			return query.toUpperCase();
		},
		() => Bun.sleep(5),
	);
	const results = await Promise.all([find("a"), find("ab"), find("abc")]);
	expect(seen).toEqual(["abc"]);
	expect(results).toEqual(["ABC", "ABC", "ABC"]);
});
