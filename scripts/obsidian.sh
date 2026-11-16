#!/usr/bin/env bash
# Opens a test vault with the plugin in Obsidian on a virtual display, DevTools on localhost,
# and rebuilds main.js on change. Run in `nix develop path:.#obsidian`.
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
dev_dir=${LICHEN_SYNC_DEV_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/lichen-sync-dev}
vault=$dev_dir/vault
port=${DEVTOOLS_PORT:-9222}
: "${HOT_RELOAD_PLUGIN:?run in nix develop path:.#obsidian}"

# The plugin's folder is the vault's own, not a link to the repo, so data.json stays with its vault.
plugins=$vault/.obsidian/plugins
mkdir -p "$plugins/hot-reload" "$plugins/lichen-sync" "$dev_dir/config/obsidian"
install -m 644 "$HOT_RELOAD_PLUGIN"/{main.js,manifest.json} "$plugins/hot-reload/"
install -m 644 "$repo/manifest.json" "$plugins/lichen-sync/"
touch "$plugins/lichen-sync/.hotreload"
echo '["hot-reload","lichen-sync"]' >"$vault/.obsidian/community-plugins.json"

# Obsidian keeps its vault list in its config dir: a separate one keeps this instance off the user's vaults.
export XDG_CONFIG_HOME=$dev_dir/config
cat >"$XDG_CONFIG_HOME/obsidian/obsidian.json" <<EOF
{"vaults":{"lichensyncdev0000":{"path":"$vault","ts":0,"open":true}},"updateDisabled":true}
EOF
# A downloaded update there would replace the version the flake pins.
rm -f "$XDG_CONFIG_HOME"/obsidian/obsidian-*.asar

cd "$repo"
bun run dev --outfile "$plugins/lichen-sync/main.js" &
dev_pid=$!

# A first launch asks whether to trust the vault's plugins; this vault is ours.
(
	until bun scripts/devtools.ts eval 1 >/dev/null 2>&1; do sleep 1; done
	bun scripts/devtools.ts eval '
		for (let i = 0; i < 60 && !window.app?.plugins?.isEnabled(); i++) {
			const trust = [...document.querySelectorAll(".modal button")]
				.find((b) => b.textContent.startsWith("Trust"));
			if (trust) trust.click();
			else await new Promise((r) => setTimeout(r, 500));
		}' >/dev/null
) &
trust_pid=$!
trap 'kill $dev_pid $trust_pid 2>/dev/null' EXIT

echo "vault: $vault"
echo "devtools: http://127.0.0.1:$port (bun scripts/devtools.ts)"
xvfb-run --auto-servernum --server-args="-screen 0 1280x800x24" \
	obsidian --remote-debugging-port="$port" --disable-gpu
