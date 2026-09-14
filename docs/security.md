# Security-review: Firestore- en storage-rules

Missie m-003. Beoordeling van `firestore.rules` en `storage.rules` als security-officer:
eist elke regel `request.auth`, en is eigenaarschap goed gecontroleerd?

## Samenvatting

- **Authenticatie**: elke `match`-blok in `firestore.rules` en `storage.rules` (op de
  publieke oefening-GIF's na, zie hieronder) eist `request.auth != null` vóór er iets
  wordt gelezen of geschreven. Getest met de emulator: een niet-ingelogde gebruiker
  krijgt overal `permission-denied` (zie testcategorie "Niet ingelogd" in
  `tests/rules/firestore.rules.test.mjs`).
- **Onbekende collecties**: Firestore/Storage-regels zijn *default-deny*. Een collectie
  zonder eigen `match`-blok is dus altijd dicht. Bevestigd met een test.
- **Sporter-eigenaarschap**: een sporter kan uitsluitend zijn/haar eigen data lezen en
  schrijven (`profiles`, `logs`, `checkins`, `nutritionLogs`, `measurements`,
  `leaderboardPublic`, `mcpKeys`, `workoutRequests`). Overal getest, ook negatief
  (sporter A kan sporter B's data niet lezen/schrijven/verwijderen).
- **Trainer/beheerder-model is bewust "ledenlijst", niet "alleen eigen sporters"**: zie
  de open vraag hieronder — dit wijkt af van de missie-aanname en is een productkeuze,
  geen bug.
- **Repareerd tijdens deze review**: twee kleine verhardingen (zie "Doorgevoerde fixes"),
  geen van beide raakt bestaand gedrag van de app.

## Model per collectie/pad

| Collectie / pad | Lezen | Schrijven | Eigenaarschapscontrole |
|---|---|---|---|
| `profiles/{userId}` | eigen profiel, sporters van je eigen trainer, of elke trainer/admin (ledenlijst) | eigen profiel (rol niet zelf wijzigbaar); trainer mag sporterprofielen bewerken (geen rol); admin mag alles | ja, met bewuste ledenlijst-uitzondering voor trainer/admin |
| `mcpKeys/{keyId}` | alleen eigenaar | alleen eigenaar; **geen** update (onveranderlijk, sinds deze review expliciet dicht) | ja, strikt — geen trainer/admin-uitzondering (gevoelige koppelsleutel voor AI-chat) |
| `workouts/{workoutId}` | trainer/sporter/deelnemer van de workout, of iedereen als `audience == 'open'` | alleen de trainer die de workout beheert | ja; `audience: 'open'` is een bewuste publieke uitzondering (vrij programma) |
| `leaderboardPublic/{userId}` | elke ingelogde gebruiker (openbare ranglijst) | alleen eigen document, met validatie van naam/foto-URL | ja voor schrijven; lezen is bewust openbaar (ranglijst) |
| `logs`, `checkins`, `nutritionLogs`, `measurements` | eigenaar, of elke trainer/admin (ledenlijst) | eigenaar; trainer/admin mag aanmaken/bewerken/verwijderen mits `loggedBy`/uitvoerder zichzelf is | ja, met bewuste ledenlijst-uitzondering voor trainer/admin |
| `workoutRequests/{reqId}` | eigenaar, of elke trainer/admin | aanmaken: alleen eigen aanvraag; afhandelen: eigenaar of trainer/admin | ja |
| `sessions/{sessionId}` | trainer van de sessie, deelnemer, of elke trainer/admin | aanmaken: alleen als jij de trainer bent; bewerken/verwijderen: trainer van de sessie of elke trainer/admin | ja, met ledenlijst-uitzondering voor trainer/admin |
| storage `exercises/**` | iedereen, ook niet ingelogd | niemand (`if false`) | n.v.t. — publieke, statische GIF-dataset, geen gebruikersdata |
| storage `avatars/{uid}` | elke ingelogde gebruiker (nodig voor ranglijst-avatars) | alleen eigenaar, max. 5 MB afbeelding | ja voor schrijven; lezen bewust gedeeld |
| storage `progress/{uid}/...` | eigenaar, of elke trainer/admin | eigenaar, of elke trainer/admin | ja, met ledenlijst-uitzondering voor trainer/admin |

## Open vraag voor Kenny: "ledenlijst"-model vs. "alleen eigen sporters"

De missie vraagt dat een trainer **alleen** bij zijn/haar eigen sporters mag. Uit de
code blijkt dat de app bewust een breder model gebruikt: elke trainer/admin ziet en
beheert **alle** sporters (`ProfileContext.allSporters` = `getAllSporters()`, gebruikt
in o.a. `GroupSessionSetupDialog` om willekeurige sporters aan een groepsles toe te
voegen, en in `MetingenPage` voor metingen/voortgangsfoto's van elke sporter). Dit is
consistent doorgevoerd in `profiles`, `logs`, `checkins`, `nutritionLogs`,
`measurements`, `sessions` en de `progress`-foto's in storage, en staat al zo
gedocumenteerd in `docs/ROLLEN-EN-RECHTEN.md` ("trainers/beheerders (ledenlijst,
ranglijst)").

Dit **niet** aanscherpen tot een strikte trainer→eigen-sporter-koppeling, omdat dat
groepslessen met sporters buiten je eigen klantenkring, de ledenlijst en bestaande
functionaliteit zou breken — een grotere wijziging dan "klein en af" toelaat, en een
productkeuze die niet aan een geautomatiseerde regel-fix is.

**Vraag:** wil je naar een strikt "trainer alleen eigen sporters"-model? Dat vraagt in
elk geval: de roster-selectie in groepslessen beperken tot eigen sporters (of een
aparte "gast in groepsles"-vrijgave), en dezelfde beperking in metingen/voortgangsfoto's
en de ledenlijst-weergave. Dat raakt UI en rules tegelijk en is een apart stuk werk.

## Doorgevoerde fixes

1. **`mcpKeys`**: `allow update: if false;` toegevoegd. Er was al geen `update`-regel
   (dus impliciet dicht), maar een koppelsleutel voor AI-chats is gevoelig genoeg om dit
   expliciet te maken in plaats van op de default-deny te vertrouwen.
2. **`workouts`**: het commentaar suggereerde "alleen eigen", terwijl de regel zelf ook
   `audience == 'open'` publiek leesbaar maakt. Commentaar gecorrigeerd zodat het de
   werkelijke regel beschrijft.

Geen van beide wijzigt het gedrag van de app voor bestaande gebruikers.

## Tests

`npm run test:rules` draait `tests/rules/firestore.rules.test.mjs` tegen de Firestore-
emulator (vereist Java, geen netwerktoegang nodig). Uitgebreid in deze review met:

- Negatieve tests voor niet-ingelogde toegang op profiles, ranglijst, workouts, logs
  (lezen én schrijven).
- Een default-deny-test op een onbekende collectie (lezen én schrijven).
- Volledige dekking (positief + negatief) voor `mcpKeys`, `workoutRequests` en
  `sessions`, die nog geen tests hadden.
- Extra negatieve gevallen voor `nutritionLogs` en `measurements` (lezen/schrijven van
  andermans data), plus een positieve ledenlijst-test voor trainer-toegang.

71 tests, allemaal groen. Storage-rules zijn handmatig doorgenomen (zie tabel hierboven)
— er is geen storage-emulator in dit project opgezet; dat zou een aparte
`firebase.json`-emulatorconfiguratie en teststrategie vragen en is voor nu bewust
buiten scope gehouden (zie open vraag over scope hierboven).
