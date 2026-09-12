#!/usr/bin/env bash
# Koppelt een bestaande repo aan bold700/hq: schrijft .claude/settings.json (marketplace + plugin)
# en een CLAUDE.md-stub als die nog niet bestaat.
# Gebruik: scripts/connect-project.sh /pad/naar/repo [projectnaam]
set -euo pipefail
HQ_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:?Geef het pad naar de repo op}"
NAME="${2:-$(basename "$TARGET")}"

mkdir -p "$TARGET/.claude"
if [ -f "$TARGET/.claude/settings.json" ]; then
  node - "$TARGET/.claude/settings.json" "$HQ_DIR/templates/settings.json" <<'NODE'
const fs = require("fs");
const [target, tpl] = process.argv.slice(2);
const cur = JSON.parse(fs.readFileSync(target, "utf8"));
const add = JSON.parse(fs.readFileSync(tpl, "utf8"));
cur.extraKnownMarketplaces = { ...(cur.extraKnownMarketplaces || {}), ...add.extraKnownMarketplaces };
cur.enabledPlugins = { ...(cur.enabledPlugins || {}), ...add.enabledPlugins };
fs.writeFileSync(target, JSON.stringify(cur, null, 2) + "\n");
NODE
  echo "✔ .claude/settings.json bijgewerkt (marketplace + plugin toegevoegd)"
else
  cp "$HQ_DIR/templates/settings.json" "$TARGET/.claude/settings.json"
  echo "✔ .claude/settings.json aangemaakt"
fi

if [ ! -f "$TARGET/CLAUDE.md" ]; then
  sed "s/<projectnaam>/$NAME/" "$HQ_DIR/templates/CLAUDE.md" > "$TARGET/CLAUDE.md"
  echo "✔ CLAUDE.md-stub aangemaakt (vul 'Dit project' in)"
fi

if ! grep -q "\"$NAME\"" "$HQ_DIR/registry.json"; then
  echo "ℹ $NAME staat nog niet in registry.json; voeg een entry toe onder \"projects\" (zie skill hq-registry)."
fi
echo "Klaar. Commit de wijzigingen in $TARGET en open een nieuwe Claude Code sessie daar."
