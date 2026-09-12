#!/usr/bin/env bash
# Zet deze map als root van de repo bold700/hq en pusht naar main.
# Vereist: een LEGE repo https://github.com/bold700/hq (zonder README) en git-toegang.
# Gebruik: bash bootstrap.sh            (vanuit LiftLog/hq of waar deze map ook staat)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REMOTE="${HQ_REMOTE:-git@github.com:bold700/hq.git}"
WORK="$(mktemp -d)"

echo "▶ Kopieer hub naar $WORK"
cp -R "$HERE"/. "$WORK"/
cd "$WORK"
rm -f bootstrap.sh
git init -q -b main
git add -A
git -c user.name="${GIT_AUTHOR_NAME:-bold700}" -c user.email="${GIT_AUTHOR_EMAIL:-support@bold700.com}" \
  commit -q -m "HQ: marketplace, agents, skills, registry en 3D-wereld"
git remote add origin "$REMOTE"
echo "▶ Push naar $REMOTE (main)"
git push -u origin main
echo
echo "✔ Klaar. Volgende stappen:"
echo "  1. GitHub → bold700/hq → Settings → Pages → Source: GitHub Actions (alleen als de workflow dat niet zelf al deed)."
echo "  2. Actions → 'Publiceer 3D-wereld' → wacht tot groen → open https://bold700.github.io/hq/"
echo "  3. In een projectrepo: bash scripts/connect-project.sh /pad/naar/repo, of kopieer templates/settings.json naar .claude/settings.json"
echo "  4. Verwijder daarna de map hq/ uit LiftLog (die was alleen het vervoermiddel)."
