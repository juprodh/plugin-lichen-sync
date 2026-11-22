# Lichen Sync

Edit your [Lichen](https://lichen.wiki) wikis from Obsidian. Each wiki is a folder in your vault and each note a markdown file named after its title; a sync brings lichen.wiki's changes into your files and sends your edits back.

## Use

Install it from Obsidian's community plugins: <https://community.obsidian.md/plugins/lichen-sync>.

1. Click the Lichen icon in the ribbon, choose **Add a wiki…**, then search for a wiki or paste its lichen.wiki link. Signed in, you can choose **New wiki** there to create one.
2. Pick a folder for it, or your whole vault. Its notes come in right away.
3. Click the Lichen icon again to sync, or run **Lichen Sync: Sync all wikis**.

Public wikis sync without an account. To send your edits, sign in with your Bluesky or atproto handle: your browser opens your account's sign-in page, then lichen.wiki hands you back to Obsidian. The session stays on that device, in Obsidian's secret storage.

- A new markdown file in the wiki's folder becomes a new note.
- When you and lichen.wiki changed the same lines, your version is kept in `<wiki> (conflicts)/` and flagged in settings until you delete it.
- Moving or renaming the folder takes the wiki along. Stopping a sync leaves your files as they are.

## Network use

The plugin collects no telemetry, and contacts only:

- lichen.wiki, to read and search wikis, and to bring your sign-in back to Obsidian
- your PDS and its sign-in server, to save your edits once you sign in
- public.api.bsky.app and cdn.bsky.app, for handles and avatars
- plc.directory, or a `did:web` account's domain, to find your PDS at sign-in
- typeahead.waow.tech, to suggest handles as you type them

## License

MIT
