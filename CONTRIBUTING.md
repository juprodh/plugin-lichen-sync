# Contributing

Lichen Sync lives on Tangled: <https://tangled.org/juprodh.me/plugin-lichen-sync>. GitHub holds a mirror, which Obsidian installs from.

- Report a bug or suggest a feature in the issues, on Tangled or GitHub.
- Send a change as a pull request on Tangled, after running the checks CI runs:

```
nix develop path:.        # or install Bun yourself
bun install
bun run lint && bun run typecheck && bun run knip && bun test
```

`AGENTS.md` holds the layout and the rules a change follows.
