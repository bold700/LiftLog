# Groepslessen importeren

De groepslessen staan in een Google Sheet met per lesmoment een tabblad: 26 kolommen (Week 1 … Week 26)
met per week een lijst oefeningen. `trainingen-sgt-2026.json` is daar de uitgelezen versie van
(uit `Trainingen_SGT_2026.pdf`).

De tabbladen zijn de lesmomenten van de week:

| Tabblad | Lesmoment |
|---|---|
| 1 | Maandag |
| 2 | Dinsdag |
| 3 | Woensdag ochtend |
| 4 | Woensdag avond |
| 5 | Donderdag |
| 6 | *(leeg: vrijdag geen les)* |
| 7 | Zaterdag |
| 8 | Zondag |

Week 1 t/m 26 volgen het **weeknummer van de kalender** (ISO): in week 1 draai je Week 1, en vanaf
week 27 begint het schema opnieuw bij Week 1. Er hoort dus geen startdatum bij; "deze week" klopt
elk jaar vanzelf. Het `key`-veld per tabblad ligt vast, zodat hernoemen geen dubbele workouts oplevert.

Elke week van elke les wordt een **losse workout** in de app (7 lessen × 26 weken = 182 workouts):

- `audience: "group"`, categorie `Groepslessen` (eigen tab in Workouts), reeks = het lesmoment
  (filterchip binnen de tab, op dagvolgorde), naam `<lesmoment> · Week n`, één dag, `scheduleWeek` = 1–26
  en geen start- of einddatum;
- elke regel wordt een oefening; gym-jargon wordt vertaald naar de namen uit de oefeningencatalogus
  (`hiptrust` → Barbell Hip Thrust, `touwen` → Battle Rope Waves, `optrekken` → Pull-Up, …);
- reps in de regel (`20 lunges`, `burpees (10)`) worden `repsTarget`; afstanden en tijden (`500 m`, `1 min`) een notitie;
- supersets (`hiptrust-facepull`, `bridge march + schuine crunch`) worden twee oefeningen met "Superset met …";
- trainingsvormen (`10x10x8`, `Tabata`, `AMRAP 17min`, `8 reps beastmode`) worden de notitie van die week.

In Workouts → tab "Groepslessen" is de training van de huidige schemaweek gemarkeerd met "Deze week";
de chip "Deze week (week n)" filtert erop.

## Snelste route: knop in de app

Log in als trainer, ga naar **Beheer → Groepslessen importeren**, controleer de namen van de lesmomenten
en klik op **Importeren als workouts**. De app schrijft de workouts op jouw naam naar Firestore; er is
geen service account nodig. De data daarvoor staat in `src/data/groepslessenSgt2026.json` en wordt
opnieuw gemaakt met:

```bash
npm run import:groepslessen -- --dry-run --emit-app-data
```

## Stappen via het script (alternatief)

1. **Namen van de lesmomenten** staan in `trainingen-sgt-2026.json` (`tabs[].name`); `tabs[].key` bepaalt
   het workout-id en blijft ongewijzigd, dus hernoemen is veilig.
2. **Dry-run** om te controleren:

   ```bash
   npm run import:groepslessen -- --dry-run
   ```

   Output: `scripts/groepslessen/out/*.json` (één per workout) en `mapping-rapport.json`
   (welke bronnaam → welke oefeningnaam). Niet herkende namen staan in het rapport; voeg ze toe aan
   `ALIASES` in `scripts/import-groepslessen.mjs`.
3. **Importeren** (service account zoals bij `scripts/delete-all-accounts.cjs`):

   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
     npm run import:groepslessen -- --trainer-email trainer@voorbeeld.nl
   ```

   De workouts komen in Firestore-collectie `workouts` op naam van die trainer. Opnieuw draaien werkt
   bestaande imports bij (zelfde id's), er ontstaan geen dubbele workouts.
4. Deelnemers: de trainer start per les "Training starten" bij de huidige week en vinkt aan wie er is
   (bestaande groepsles-flow). Wil je dat sporters de les ook zelf in hun overzicht zien, zet ze dan in de
   workout onder "Deelnemers groepsles".

## Volgende periode uit Google Sheets

Exporteer elk tabblad als CSV (Bestand → Downloaden → CSV) in één map, bestandsnaam = naam van de les, en draai:

```bash
npm run import:groepslessen -- --csv ./pad/naar/csv-map --trainer-email …
```

De bestandsnaam wordt de naam van het lesmoment en de alfabetische volgorde bepaalt de chipvolgorde; noem
ze dus bijvoorbeeld `1 Maandag.csv`, `2 Dinsdag.csv`, enzovoort.

De CSV-lezer herkent de koprijen `Week 1 … Week 10`, `Week 11 … Week 20`, `Week 21 … Week 26` en leest de
oefeningen per kolom.
