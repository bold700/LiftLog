---
name: bold700-huisregels
description: Huisregels voor alle bold700-projecten (taal, commit-stijl, PR-flow, design, privacy). Wordt automatisch meegenomen bij werk in een bold700-repo; raadpleeg bij twijfel over conventies, taal of hoe een PR eruit moet zien.
---

# bold700 huisregels

Deze regels gelden in elk bold700-project, tenzij de CLAUDE.md van het project iets anders zegt.

## Taal en toon
- Communiceer met Kenny in het Nederlands. Code, identifiers en commit-onderwerpen in het Engels zijn prima, maar commit-berichten, PR-beschrijvingen en UI-copy zijn Nederlands (je-vorm, kort).
- Geen lofzang, geen herhaling van de vraag. Eerst het antwoord, dan de toelichting.

## Git en PR's
- Werk op een feature-branch, nooit direct op main.
- Commit-onderwerp: wat er voor de gebruiker verandert, niet wat je technisch deed. Voorbeeld: `Voeding: zoeken werkt weer, via eigen endpoint`.
- Open PR's als draft. Beschrijving: wat verandert er, waarom, hoe getest.
- Draai voor elke push de snelle checks van het project (lint, typecheck, tests). Push nooit rood.

## Design en UI
- Basis is Material 3 met de tokens uit het bold700 design system. Geen hardcoded kleuren of spacing als er een token voor is.
- Mobiel eerst: tapdoelen minimaal 44 px, werkt met één hand, dark mode en light mode beide af.
- Bij UI-wijzigingen: vraag de `ux-reviewer` en `design-system-guardian` agents om een check voordat je de PR opent.

## Data en privacy
- Gezondheids- en klantdata blijft in de projectdatabase. Nooit naar externe services sturen zonder expliciete opdracht.
- Firestore- en storage-rules horen bij de feature: pas ze aan in dezelfde PR als het datamodel verandert.

## Agents gebruiken
- `code-reviewer` voor elke PR.
- `ux-reviewer` en `design-system-guardian` bij UI.
- `penpot-expert` bij alles rond Penpot, plugins en tokens.
- `fitness-domain` bij LiftLog, FitnessFlow, workout-timer, exercise-database en foodscan.
- `/hq` toont welke agents en projecten er zijn en waar ze thuishoren.

## Werk klein
Liever drie kleine PR's dan één grote. Als een taak groter wordt dan verwacht: stop, meld het, en stel een opsplitsing voor.
