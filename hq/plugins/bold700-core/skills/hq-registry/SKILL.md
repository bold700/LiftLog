---
name: hq-registry
description: Hoe je een project of agent registreert in bold700/hq (registry.json) zodat het in het /hq overzicht en de 3D-wereld verschijnt. Gebruik bij "voeg project toe aan hq", "nieuwe agent maken", "koppel repo aan hub" of als een repo nog niet in het overzicht staat.
---

# HQ registry bijwerken

Alles wat in het overzicht en de 3D-wereld staat komt uit `registry.json` in de root van `bold700/hq`. Repos die daar niet in staan verschijnen automatisch in de cluster `lab`, met alleen de gegevens uit GitHub.

## Structuur van registry.json

```json
{
  "clusters": {
    "fitness": { "label": "Fitness", "color": "#ff6b4a", "agents": ["fitness-domain", "code-reviewer"] }
  },
  "projects": {
    "LiftLog": { "cluster": "fitness", "description": "Trainingslogboek voor PT en sporter", "status": "active", "agents": ["fitness-domain"], "links": { "app": "https://..." } }
  },
  "agents": {
    "fitness-domain": { "description": "...", "file": "plugins/bold700-core/agents/fitness-domain.md" }
  }
}
```

- `cluster`: sleutel uit `clusters`. Bepaalt de plek in de wereld.
- `status`: `active`, `paused`, `archived` of `idea`.
- `agents` op een project vult de cluster-agents aan; hoeft niet herhaald te worden.
- `links`: vrije sleutels (`app`, `design`, `docs`). GitHub-link wordt automatisch gemaakt.

## Nieuw project toevoegen
1. Voeg een entry toe onder `projects` met minimaal `cluster` en `description`.
2. Koppel de repo aan de hub: kopieer `templates/settings.json` naar `.claude/settings.json` in die repo (of draai `scripts/connect-project.sh <pad-naar-repo>`).
3. Commit in `bold700/hq`; de GitHub Pages workflow bouwt de wereld opnieuw.

## Nieuwe agent maken
1. Maak `plugins/bold700-core/agents/<naam>.md` met frontmatter `name`, `description`, `tools`, `model` en daaronder de systeemprompt. Schrijf de description zo dat Claude weet wanneer de agent proactief ingezet moet worden.
2. Voeg de agent toe onder `agents` in registry.json en aan de relevante `clusters[].agents`.
3. Commit en push naar `bold700/hq`. In andere projecten: `/plugin` → update, of wacht op automatische update bij de volgende sessie.

Maak agents nooit los in `~/.claude/agents/` of in een enkele repo: die verdwijnen op het web en zijn niet gedeeld. Alles gaat via de hub.
