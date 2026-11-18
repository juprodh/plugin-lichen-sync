# Lichen Sync

Syncs the notes of [Lichen](https://lichen.wiki) wikis with folders of your Obsidian vault. Each wiki syncs into its own folder, one file per note, named by the note's title. In progress: desktop only for now.

## Use

1. Open **Settings → Lichen Sync** and choose **Add wiki**. Search Lichen's public wikis, or paste a lichen.wiki link.
2. Pick the folder the wiki syncs into, or your whole vault. Its notes come in right away.
3. Click the Lichen icon in the ribbon to sync all wikis or one of them, or run **Lichen Sync: Sync all wikis** from the command palette.

Syncing a public wiki needs no account. To send your edits to a wiki you write in, sign in with your Bluesky or atproto handle: the sign-in opens in your browser. A sync first merges what changed on lichen.wiki into your files, then sends your edits. Edits that overlap a change on lichen.wiki are kept in a copy in `<wiki> (conflicts)/` rather than overwritten, and the wiki's page in settings flags them until you delete the copy.

A new markdown file in a wiki's folder, or in one of its subfolders, becomes a new note named by its filename. A wiki that takes the whole vault is its only wiki, and keeps its conflict copies in `Lichen conflicts/`. Moving or renaming a wiki's folder in Obsidian takes the wiki and its conflict copies along. Stopping a wiki's sync leaves its folder and files as they are.

## Network use

The plugin contacts these services, and no others:

- **lichen.wiki**, to list and read wikis and notes, to search public wikis, and to check that your edits were taken.
- **Your PDS** (the server hosting your atproto account) and its sign-in server, only once you sign in: your edits are written there as records, as lichen.wiki's own editor writes them.
- **public.api.bsky.app**, to turn a handle into an account identifier, and to show your name and avatar once you are signed in. Avatars load from **cdn.bsky.app**.
- **plc.directory**, or the account's own domain for a `did:web` account, to find your PDS when you sign in.
- **typeahead.waow.tech**, a community index of atproto handles, to suggest handles as you type one to sign in. What you type there is sent to it.

Signing in uses a local address, `127.0.0.1:52741`, for the browser to hand the sign-in back to Obsidian. The session is stored in the plugin's `data.json` in your vault; signing out revokes it.

The plugin collects no telemetry.

## License

MIT
