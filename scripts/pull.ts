// Pulls a public wiki as the plugin does, with the sync state in <dir>/.lichen-sync.json.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { lichenAppview } from "@lichen-wiki/sync/appview";
import { resolveWiki } from "@lichen-wiki/sync/identity";
import { pullWiki } from "@lichen-wiki/sync/pull";
import { parseSyncState } from "@lichen-wiki/sync/sync-state";
import type { Vault } from "@lichen-wiki/sync/vault";

const [owner, wikiSlug, dir] = process.argv.slice(2);
if (!owner || !wikiSlug || !dir) {
	console.error(
		"usage: bun scripts/pull.ts <owner handle or DID> <wiki slug> <dir>",
	);
	process.exit(1);
}

const readOrNull = (path: string) =>
	readFile(path, "utf8").catch((err: NodeJS.ErrnoException) => {
		if (err.code === "ENOENT") return null;
		throw err;
	});

const vault: Vault = {
	read: (path) => readOrNull(join(dir, path)),
	write: async (path, content) => {
		await mkdir(dirname(join(dir, path)), { recursive: true });
		await writeFile(join(dir, path), content);
	},
	list: async (folder) => {
		const entries = await readdir(join(dir, folder), {
			withFileTypes: true,
			recursive: true,
		}).catch((err: NodeJS.ErrnoException) => {
			if (err.code === "ENOENT") return [];
			throw err;
		});
		return entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
			.map((entry) => relative(dir, join(entry.parentPath, entry.name)));
	},
};

const stateFile = join(dir, ".lichen-sync.json");
const sync = parseSyncState(JSON.parse((await readOrNull(stateFile)) ?? "{}"));
const wiki = await resolveWiki(owner, wikiSlug);
const { state, report } = await pullWiki(
	lichenAppview(),
	vault,
	wiki,
	wikiSlug,
	sync[wiki] ?? {},
);
await writeFile(
	stateFile,
	JSON.stringify({ ...sync, [wiki]: state }, null, "\t"),
);
console.log(report);
