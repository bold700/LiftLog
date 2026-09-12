# bold700 HQ

Eén plek voor alles wat over projecten heen gaat: de gedeelde Claude Code agents en skills, de huisregels, het register van projecten, en de 3D-wereld waarin je alles ziet.

**Wereld:** https://bold700.github.io/hq/ · **Plan:** [docs/PLAN.md](docs/PLAN.md)

## Wat zit erin

| Map | Wat |
|---|---|
| `.claude-plugin/marketplace.json` | De marketplace `bold700`. Projecten wijzen hiernaar. |
| `plugins/bold700-core/` | De plugin: 5 agents, 2 skills, het `/hq` commando. |
| `registry.json` | Welke projecten er zijn, in welk cluster, met welke agents. |
| `world/` | De 3D-wereld (three.js, statisch, geen build). |
| `templates/` | `settings.json` en `CLAUDE.md` voor nieuwe projecten. |
| `scripts/connect-project.sh` | Koppelt een repo aan de hub in één commando. |
| `scripts/build-snapshot.mjs` | Haalt repo-data op uit GitHub voor de wereld (draait in CI). |

## Agents

| Agent | Wanneer |
|---|---|
| `ux-reviewer` | Schermen en flows beoordelen op bruikbaarheid en toegankelijkheid |
| `penpot-expert` | Penpot API, MCP-server, plugins, design tokens |
| `design-system-guardian` | Tokens, componenten, Material 3 consistent houden |
| `code-reviewer` | Elke diff en PR op bugs en regressies |
| `fitness-domain` | LiftLog, FitnessFlow en de andere fitness-apps |

Agents wijzigen of toevoegen: bewerk `plugins/bold700-core/agents/*.md`, werk `registry.json` bij, push naar `main`. Elk gekoppeld project krijgt de update bij de volgende sessie (of direct via `/plugin` → update).

## Een project koppelen

```bash
bash scripts/connect-project.sh /pad/naar/repo
```

Of handmatig: kopieer `templates/settings.json` naar `.claude/settings.json` in de repo. Open daarna een nieuwe Claude Code sessie in dat project en typ `/hq`.

## De wereld lokaal bekijken

```bash
cd world && python3 -m http.server 8000
```

Open http://localhost:8000. Lokaal leest de pagina `data/repos.json` en `data/registry.json`; in CI worden die vers gebouwd.
