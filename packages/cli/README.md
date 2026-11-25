# lichen

Sync a folder of markdown with a [Lichen](https://lichen.wiki) wiki, from a terminal or an agent. Each note is a file named after its title; a sync brings lichen.wiki's changes into the folder, then publishes yours.

Node 22.13 or later. Run it with `npx @lichen-wiki/cli`, or install `lichen` with `npm install -g @lichen-wiki/cli`.

## Use

```
lichen login alice.bsky.social        # sign in, in your browser
lichen list                           # your wikis, as the @owner/slug sync takes
cd garden && lichen sync @alice.bsky.social/garden   # link this folder and bring the notes in
lichen sync -m "Planting notes"       # later: pull, then publish your edits
```

| Command | Does |
|---|---|
| `lichen login [handle]` | Signs in with your Atmosphere account. |
| `lichen logout` | Signs out, ending the session on your PDS. |
| `lichen list [@owner \| --bookmarks \| --all [words]]` | Lists your wikis, an owner's, the ones you bookmarked, or every public wiki (newest first, or matching words). |
| `lichen new [name]` | Creates a public wiki, empty. `--slug`, `--description` and `--language` set the rest; in a terminal it asks. |
| `lichen sync [<wiki>] [-m message]` | Pulls, then publishes. The first sync in a folder links it to `<wiki>`: `@owner/slug` or its lichen.wiki link. |

Public wikis sync without an account; publishing needs you signed in and allowed to edit the wiki.

- Every markdown file in the folder and its subfolders is a note, and a new one becomes a new note. Hidden files and folders, as `.git`, are left out.
- When you and lichen.wiki changed the same lines, the note takes lichen.wiki's version and yours is kept in `Lichen conflicts/`. Fold it in, delete the copy, and sync again.
- A note deleted on lichen.wiki is removed from the folder; lichen.wiki keeps its history. If you had edited it, your version is kept in `Lichen conflicts/`.
- Before publishing, `sync` lists what it will publish and asks for a message describing your changes. With none, lichen.wiki's History shows its own label for each change.
- The folder's link and sync state are in `.lichen/state.json`. Deleting it unlinks the folder.

## In scripts and agents

- Results go to stdout and everything else to stderr. Every command takes `--json`, for its result as JSON on stdout.
- The exit code is `0` when the folder and the wiki match after the command, `1` otherwise, with the reason on stderr or in the output.
- A question appears only when stdin is a terminal and no agent is detected. Pass `-m` or `--no-input` to never be asked.
- Colors follow `NO_COLOR` and `FORCE_COLOR`, and `--no-color` turns them off.

## Sign-in and network use

The session is kept in `~/.config/lichen/session.json` (or `$XDG_CONFIG_HOME/lichen/`), readable by you alone; `lichen logout` removes it. lichen collects no telemetry, and contacts only:

- lichen.wiki, to read and search wikis
- your PDS and its sign-in server, to sign in and publish your edits
- public.api.bsky.app, to find an account from its handle
- plc.directory, or a `did:web` account's domain, to find your PDS at sign-in

## License

MIT
