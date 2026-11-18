# Lichen Sync

The Obsidian plugin that syncs the notes of your Lichen wikis with a vault folder. Plugin id `lichen-sync`: it names the plugin's folder in every vault and keys its settings, so it never changes.

## Commands

```
nix develop path:.        # bun
bun run lint:fix && bun run typecheck && bun run knip && bun test   # CI's checks (.tangled/workflows/ci.yml)
bun run build             # main.js, minified
bun run dev               # main.js, rebuilt on change
bun scripts/pull.ts <owner> <wiki> <dir>   # pull a public wiki into a folder, as the plugin does into a vault

nix develop path:.#obsidian -c scripts/obsidian.sh   # the plugin in a test Obsidian, headless
bun scripts/devtools.ts eval|screenshot|logs         # drive that Obsidian
```

`bun run lint` runs Biome, then ESLint with `eslint-plugin-obsidianmd`, the rules Obsidian's review checks a submission against. Update that plugin before a release, since the review runs its latest version. TypeScript stays on 6 until `typescript-eslint` supports 7.

To release, raise `version` in `manifest.json` (`x.y.z`, no `v`) and push `main` to tangled: CI mirrors it to GitHub, which Obsidian reads, and releases that version there.

`@lichen-wiki/client` comes from npm, published from `packages/client` in lichen.wiki's repo (<https://tangled.org/juprodh.me/lichen.wiki>). To try an unpublished change, run `bun link` there and `bun link @lichen-wiki/client` here: the plugin then reads that package's `dist/`, so rerun its `bun run build` after each change. `bun install` brings back the published one.

`scripts/obsidian.sh` runs the Obsidian the flake pins, updates off, on a virtual display, with DevTools on `127.0.0.1:9222`. Its test vault and Obsidian profile are in `~/.local/state/lichen-sync-dev/` (`LICHEN_SYNC_DEV_DIR`), apart from your own vaults. `bun run dev` builds `main.js` into the vault's plugin folder and Hot Reload reloads it. Running it on another machine? Forward ports 9222 (DevTools) and 52741 (sign-in).

## Layout

```
src/main.ts       the entry: default-exports the plugin class, as Obsidian requires
src/host/         everything that touches Obsidian's API: the plugin class, the settings tab, the vault adapter
src/core/         the sync logic: platform-free, so it runs under `bun test` and `scripts/`
scripts/          core/ driven from a terminal, with the filesystem as the vault
tests/            mirrors src/core/
```

`main.ts` < `host/` < `core/`: each imports only what is to its right. `core/` never imports `obsidian`, a runtime's builtins (`node:`, `bun:`), or `src/host/`, and tests and scripts import only `core/`: the `obsidian` package ships types only, so code that loads it cannot run outside Obsidian (`tests/conventions.test.ts`).

## Rules

- Every record rule comes from `@lichen-wiki/client`, so the plugin writes what ingest keeps.
- A synced folder names files as a lichen.wiki export does. `src/core/filenames.ts` mirrors lichen.wiki's `src/import-export/filenames.ts` until that moves into `@lichen-wiki/client`: change both or neither.
- A pull never loses a local edit: it merges the remote change in, and when the two overlap it writes the local text to a copy in `<wiki> (conflicts)/`. Merging matches exact context only.
- Every markdown file in a wiki's folder or its subfolders is a note, so a push creates a note from a new one; nothing else the plugin writes goes there. A whole-vault wiki keeps its conflict copies in `Lichen conflicts/`, which it leaves out.
- A renamed file stays its note: the plugin follows vault renames, and a push creates no note while a synced file is missing.
- A push writes only on the head it last synced; a moved head waits for a pull to merge it. It never retracts a revision, since a head that moved past it reads the same as one that lost.
- Sync state lives in the plugin's data, never in a note's frontmatter.
- Node APIs stay in desktop-only paths (`src/host/loopback.ts`), so mobile remains possible.
