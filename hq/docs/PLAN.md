# Plan: alle projecten en agents bij elkaar

## Het probleem
- 67 repos onder bold700, elk met eigen (of geen) Claude-configuratie.
- Agents die je in één project aanmaakt bestaan niet in de rest. Op Claude Code op het web verdwijnt `~/.claude` na elke sessie, dus "globale" agents bestaan daar niet.
- Geen overzicht: welke projecten leven, welke slapen, welke agent hoort waar.

## De oplossing in drie lagen

### 1. Eén bron: `bold700/hq` als plugin-marketplace
Claude Code kent [plugins en marketplaces](https://code.claude.com/docs/en/plugin-marketplaces). Een marketplace is gewoon een repo met `.claude-plugin/marketplace.json` in de root. Een plugin is een map met agents, skills en commands.

Elke projectrepo krijgt alleen dit in `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": { "bold700": { "source": { "source": "github", "repo": "bold700/hq" } } },
  "enabledPlugins": { "bold700-core@bold700": true }
}
```

Zodra je in dat project een sessie opent (lokaal of op het web) wordt de plugin opgehaald en zijn alle agents er. Eén wijziging in de hub, overal beschikbaar.

Wat er bewust niet in zit: een CLAUDE.md in de plugin (Claude Code laadt die niet). Huisregels zitten daarom in de skill `bold700-huisregels`; die wordt automatisch meegenomen. Per project blijft een korte eigen CLAUDE.md bestaan voor projectspecifieke dingen (zie `templates/CLAUDE.md`).

### 2. Eén register: `registry.json`
Clusters (fitness, penpot, bold700, klanten, tools, lab), projecten met status en beschrijving, en welke agents bij welk cluster of project horen. Dit is de enige plek die je bijhoudt. Repos die er niet in staan verschijnen automatisch in `lab` met alleen GitHub-data.

`/hq` in elke sessie leest dit register en vertelt je waar je bent en welke agents hier horen.

### 3. Eén beeld: de 3D-wereld
`world/` is een statische three.js-pagina op GitHub Pages:
- **HQ-kern** in het midden, zes **clusters** als sterrenbeelden eromheen.
- Elk project een **ster**: groot en licht als er de laatste 30 dagen gepusht is, klein en dof als het meer dan een jaar stil is. Gearchiveerd is een wireframe. Privé heeft een ring.
- **Agents** als satellieten die om hun cluster draaien.
- Links een zoekveld, clusterfilters en een lijst op recentheid. Klik op een ster voor details en links (GitHub, app, Claude Code).

De workflow `pages.yml` bouwt bij elke push naar `main` en elke nacht een verse snapshot uit de GitHub API, kopieert `registry.json` mee en publiceert `world/`.

## Wat er nu klaarstaat
- Marketplace en plugin `bold700-core` met 5 agents, 2 skills, `/hq`.
- `registry.json` met 51 geregistreerde projecten in 6 clusters (de rest valt in lab).
- De 3D-wereld, getest met een render van de huidige data.
- Templates en `connect-project.sh` om een repo te koppelen.
- Pages-workflow met dagelijkse refresh.
- LiftLog is als eerste project gekoppeld (`.claude/settings.json` in die repo).

## Wat jij nog doet (5 minuten)
1. Maak op GitHub een **lege** repo `bold700/hq` aan (publiek, zonder README).
2. Draai `bash hq/bootstrap.sh` vanuit je LiftLog-checkout (of laat Claude het pushen).
3. Kijk of Actions → "Publiceer 3D-wereld" groen wordt; zo niet, zet bij Settings → Pages de bron op "GitHub Actions" en start de workflow opnieuw.
4. Open https://bold700.github.io/hq/.
5. Open LiftLog in Claude Code, typ `/hq` en `/agents`; je ziet de vijf agents uit de hub.

## Daarna, in deze volgorde
- **Week 1**: de vijf agents scherpstellen op echte taken. Elke keer dat een agent iets mist: prompt aanpassen in de hub, niet in het project.
- **Week 1**: nog vijf actieve repos koppelen met `connect-project.sh` (penpotmcp, bold700-site, leenlog, vastgoedagent, designpartner).
- **Week 2**: `registry.json` opschonen: juiste beschrijvingen, statussen, links naar live apps. De wereld wordt daar direct beter van.
- **Later**: agents per project registreren door `.claude/agents/` in repos te scannen (CI-stap in de hub); open PR's en issues per ster tonen; de wereld als startscherm gebruiken om direct een Claude Code sessie te openen in een project.

## Waarom niet anders
- **Niet** agents in elke repo kopiëren: dan drift je binnen een week uit elkaar.
- **Niet** `~/.claude/agents` lokaal: bestaat niet op het web en niet op een tweede machine.
- **Niet** een aparte database of app voor het overzicht: GitHub weet al wat er leeft, de registry vult alleen aan wat GitHub niet weet.
