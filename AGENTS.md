# Lichen Sync

The Obsidian plugin that syncs the notes of your Lichen wikis with a vault folder. Plugin id `lichen-sync`: it names the plugin's folder in every vault and keys its settings, so it never changes. Design and scope: `../docs/issues/issue-XX-lichen-sync.md`.

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

`bun run lint` runs Biome, then ESLint with `eslint-plugin-obsidianmd`, the rules Obsidian's review checks a submission against, on `src/` and the root files, warnings included. Update that plugin before a release, since the review runs its latest version. TypeScript stays on 6 until `typescript-eslint` supports 7.

`@lichen-wiki/client` comes from npm, published from `lichen-repo/packages/client`. To try an unpublished change, run `bun link` there and `bun link @lichen-wiki/client` here: the plugin then reads that package's `dist/`, so rerun its `bun run build` after each change. `bun install` brings back the published one.

`scripts/obsidian.sh` runs the Obsidian the flake pins, updates off, on a virtual display, with DevTools on `127.0.0.1:9222`. Its test vault and Obsidian profile are in `~/.local/state/lichen-sync-dev/` (`LICHEN_SYNC_DEV_DIR`), apart from your own vaults. `bun run dev` builds `main.js` into the vault's plugin folder and Hot Reload reloads it. To see and click the window from another machine, forward the port (`ssh -L 9222:127.0.0.1:9222 <host>`) and inspect it from `chrome://inspect`. Sign-in redirects to `127.0.0.1:52741`, so forward that port too and open the URL `scripts/obsidian.sh` logs for it (`bun scripts/devtools.ts logs`) in your own browser.

## Layout

```
src/main.ts       the entry: default-exports the plugin class, as Obsidian requires
src/host/         everything that touches the plugin API: the plugin class, the settings tab, the vault adapter
src/core/         the sync logic: platform-free, so it runs under `bun test` and `scripts/`
scripts/          core/ driven from a terminal, with the filesystem as the vault
tests/            mirrors src/core/
```

The host is the app running the plugin: Obsidian. Reams runs plugins too, through its own implementation of Obsidian's plugin API (`../reams/src/plugin/obsidian-stubs.ts`), but `host/` targets Obsidian only for now.

`main.ts` < `host/` < `core/`: each imports only what is to its right. `core/` never imports `obsidian`, a runtime's builtins (`node:`, `bun:`), or `src/host/`, and tests and scripts import only `core/`: the `obsidian` package ships types only, so code that loads it cannot run outside a host (`tests/conventions.test.ts`). Biome rejects import cycles.

## Rules

- Every record rule comes from `@lichen-wiki/client`, so the plugin writes what ingest keeps.
- A synced folder names files as a lichen.wiki export does. `src/core/filenames.ts` mirrors `lichen-repo/src/import-export/filenames.ts` until that moves into `@lichen-wiki/client`: change both or neither.
- A pull never loses a local edit: it merges the remote change in, and when the two overlap it writes the local text to a copy in `<wiki> (conflicts)/`. Merging matches exact context only.
- Every markdown file in a wiki's folder or its subfolders is a note, so a push creates a note from a new one; nothing else the plugin writes goes there. A whole-vault wiki keeps its conflict copies in `Lichen conflicts/`, which it leaves out.
- A renamed file stays its note: the plugin follows vault renames, and a push creates no note while a synced file is missing.
- A push writes only on the head it last synced; a moved head waits for a pull to merge it. It never retracts a revision, since a head that moved past it reads the same as one that lost.
- Sync state lives in the plugin's data, never in a note's frontmatter.
- Named exports only, except `src/main.ts`.
- The bundle runs in Electron and in mobile WebViews: no Node APIs outside a desktop-only path.
