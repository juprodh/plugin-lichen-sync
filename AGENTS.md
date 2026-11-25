# Lichen Sync

The Obsidian plugin that syncs the notes of your Lichen wikis with a vault folder, and `lichen`, the CLI that syncs them with a folder on disk. Plugin id `lichen-sync`: it names the plugin's folder in every vault and keys its settings, so it never changes.

## Commands

```
nix develop path:.        # bun
bun run lint:fix && bun run typecheck && bun run knip && bun test   # CI's checks (.tangled/workflows/ci.yml)
bun run build             # main.js, minified
bun run dev               # main.js, rebuilt on change
bun run --cwd packages/cli build   # packages/cli/dist/lichen.js, the CLI in one file
node packages/cli/dist/lichen.js --help

nix develop path:.#obsidian -c scripts/obsidian.sh   # the plugin in a test Obsidian, headless
bun scripts/devtools.ts eval|open|screenshot|logs    # drive that Obsidian
```

`bun run lint` runs Biome, then ESLint with `eslint-plugin-obsidianmd`, the rules Obsidian's review checks a submission against. Update that plugin before a release, since the review runs its latest version. TypeScript stays on 6 until `typescript-eslint` supports 7.

To release, raise `version` in `manifest.json` (`x.y.z`, no `v`) and push `main` to tangled: CI mirrors it to GitHub, which Obsidian reads, and releases that version there. To release the CLI, raise `version` in `packages/cli/package.json` and run `bun publish` in `packages/cli`, which builds first.

`@lichen-wiki/client` comes from npm, published from `packages/client` in lichen.wiki's repo (<https://tangled.org/juprodh.me/lichen.wiki>). To try an unpublished change, run `bun link` there and `bun link @lichen-wiki/client` here: the plugin then reads that package's `dist/`, so rerun its `bun run build` after each change. `bun install` brings back the published one. Under the link `bun test` fails in `pull` and `push`, the package resolving a second `@atcute/client` from lichen.wiki's `node_modules`: to run the suite, `bun install` and copy the changed files of that `dist/` into `node_modules/@lichen-wiki/client/dist/` instead.

`scripts/obsidian.sh` runs the Obsidian the flake pins, updates off, on a virtual display, with DevTools on `127.0.0.1:9222`. Its test vault and Obsidian profile are in `~/.local/state/lichen-sync-dev/` (`LICHEN_SYNC_DEV_DIR`), apart from your own vaults. `bun run dev` builds `main.js` into the vault's plugin folder and Hot Reload reloads it. Running it on another machine? Forward port 9222 (DevTools). To sign in there, open the URL it logs in your own browser, then hand the callback page's "Open Obsidian" link to `bun scripts/devtools.ts open`, since it has no OS to route `obsidian://`.

## Layout

```
src/main.ts       the entry: default-exports the plugin class, as Obsidian requires
src/host/         everything that touches Obsidian's API: the plugin class, the settings tab, the vault adapter
src/core/         the plugin's own logic, platform-free: its settings and data.json, the profile lookup
packages/sync/    @lichen-wiki/sync, private: the sync logic, platform-free, which the plugin and the CLI bundle
packages/cli/     @lichen-wiki/cli, bin `lichen`: commands, the folder as a vault, its sync state, the sign-in
scripts/          the test Obsidian and the tool that drives it
tests/            mirrors src/core/, as packages/sync/tests/ mirrors packages/sync/src/, and packages/cli/tests/ the CLI's commands over the sync package's fakes
```

`main.ts` < `host/` < `core/` < `packages/sync`: each imports only what is to its right. `core/` and the package never import `obsidian` or a runtime's builtins (`node:`, `bun:`), `core/` never imports `src/host/`, the package imports nothing of `src/`, and tests and scripts import only `core/` and the package: the `obsidian` package ships types only, so code that loads it cannot run outside Obsidian. `packages/cli` imports the sync package, `@lichen-wiki/client` and Node's builtins, never `src/` (`tests/conventions.test.ts`).

## Rules

- Every record rule comes from `@lichen-wiki/client`, so the plugin and the CLI write what ingest keeps. Typed text takes its shape there too, as on lichen.wiki: a description (`wikiDescription`), an edit message (`revisionMessage`), a note's line endings (`readNote` in `packages/sync/src/vault.ts`). Neither adds a check or a shape of its own.
- A synced folder names files as a lichen.wiki export does, through `@lichen-wiki/client/filenames`.
- The plugin and the CLI word a refusal, derive a new wiki's address and list languages through `@lichen-wiki/client` (`problems`, `check`, `languages`), as lichen.wiki does.
- A pull never loses a local edit: it merges the remote change in, and when the two overlap it writes the local text to a copy in `<wiki> (conflicts)/`. Merging matches exact context only.
- A note deleted on lichen.wiki (`listNotes` with `includeDeleted`) leaves the folder and the sync state: its file goes to the host's trash, or to a copy in `<wiki> (conflicts)/` when edited here. A note no longer listed at all keeps both, reported, since a wiki made private lists nothing.
- Every markdown file in a wiki's folder or its subfolders is a note, so a push creates a note from a new one; nothing else the plugin writes goes there. A whole-vault wiki keeps its conflict copies in `Lichen conflicts/`, which it leaves out.
- A renamed file stays its note: the plugin follows vault renames, and a push creates no note while a synced file is missing.
- A push writes only on the head it last synced; a moved head waits for a pull to merge it. It never retracts a revision, since a head that moved past it reads the same as one that lost.
- Sync state lives in the plugin's data, or in a CLI folder's `.lichen/state.json`, never in a note's frontmatter.
- The plugin runs on mobile too, so it uses no Node API.
- The CLI runs on Node 22.13 or later, with its builtins only: no argument, color or prompt library. `bun build` inlines everything into one file, all dependencies in `devDependencies`, and CI fails it past 300 KB, since `npx` fetches it on each run.
- The CLI asks only when someone can answer (`packages/cli/src/ask.ts`), and exits `0` only when the folder and the wiki match.
- The CLI's session lives in `~/.config/lichen/session.json`, owner-only, with the redirect it signed in with: a loopback client's id is built from it, and a refresh must present the same one.
- The OAuth session lives in Obsidian's secret storage, never in `data.json`, which travels with the vault (`src/host/secrets.ts`).
