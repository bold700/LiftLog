---
description: Toon het bold700 overzicht: alle clusters, projecten en agents uit bold700/hq, en welke agents bij dit project horen.
allowed-tools: Bash(curl:*), Bash(git:*), Read, WebFetch
---

Haal `registry.json` op uit de hub en geef Kenny een compact overzicht.

Stappen:
1. Probeer eerst lokaal: als `${CLAUDE_PLUGIN_ROOT}/../../registry.json` bestaat, lees dat bestand. Anders haal `https://raw.githubusercontent.com/bold700/hq/main/registry.json` op.
2. Bepaal het huidige project uit de git remote (`git remote get-url origin`) en zoek de repo-naam op in `projects`.
3. Toon, in het Nederlands:
   - **Dit project**: naam, cluster, status, en de agents die hier horen (cluster-agents plus project-agents). Als het project niet in de registry staat: zeg dat, en verwijs naar de skill `hq-registry` om het toe te voegen.
   - **Clusters**: per cluster het aantal projecten en de agents.
   - **Beschikbare agents**: naam plus één regel description.
   - Link naar de 3D-wereld: https://bold700.github.io/hq/
4. Als de gebruiker een argument meegeeft (`/hq <naam>`), toon alleen dat project of die agent in detail.

Houd het kort: dit is een spiekbriefje, geen rapport.
