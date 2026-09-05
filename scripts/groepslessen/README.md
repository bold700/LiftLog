# Groepslessen importeren

De groepslessen staan in een Google Sheet met per les een tabblad: 26 kolommen (Week 1 … Week 26) met
per week een lijst oefeningen. `trainingen-sgt-2026.json` is daar de uitgelezen versie van
(uit `Trainingen_SGT_2026.pdf`; tabblad 6 was leeg en is weggelaten).

`node scripts/import-groepslessen.mjs` zet elk tabblad om in één groepsles-workout in de app:

- workout met `audience: "group"`, één dag per week (`Week 1` … `Week 26`), startdatum = Week 1;
- elke regel wordt een oefening; gym-jargon wordt vertaald naar de namen uit de oefeningencatalogus
  (`hiptrust` → Barbell Hip Thrust, `touwen` → Battle Rope Waves, `optrekken` → Pull-Up, …);
- reps in de regel (`20 lunges`, `burpees (10)`) worden `repsTarget`; afstanden en tijden (`500 m`, `1 min`) een notitie;
- supersets (`hiptrust-facepull`, `bridge march + schuine crunch`) worden twee oefeningen met "Superset met …";
- trainingsvormen (`10x10x8`, `Tabata`, `AMRAP 17min`, `8 reps beastmode`) worden de notitie van die week.

In de app staat bij zo'n workout de huidige week bovenaan (badge "Deze week"), berekend vanaf de startdatum.

## Stappen

1. **Namen van de lessen** aanpassen in `trainingen-sgt-2026.json` (`tabs[].name`, nu "Groepsles 1" … "Groepsles 8").
   De naam bepaalt ook het workout-id (`schema_sgt2026_<naam>`), dus kies hem vóór de eerste echte import.
2. **Dry-run** om te controleren:

   ```bash
   npm run import:groepslessen -- --dry-run --start 2026-09-07
   ```

   Output: `scripts/groepslessen/out/*.json` (één per workout) en `mapping-rapport.json`
   (welke bronnaam → welke oefeningnaam). Niet herkende namen staan in het rapport; voeg ze toe aan
   `ALIASES` in `scripts/import-groepslessen.mjs`.
3. **Importeren** (service account zoals bij `scripts/delete-all-accounts.cjs`):

   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
     npm run import:groepslessen -- --trainer-email trainer@voorbeeld.nl --start 2026-09-07
   ```

   De workouts komen in Firestore-collectie `workouts` op naam van die trainer. Opnieuw draaien werkt
   bestaande imports bij (zelfde id's), er ontstaan geen dubbele workouts.
4. Deelnemers: de trainer start per les "Training starten" bij de huidige week en vinkt aan wie er is
   (bestaande groepsles-flow). Wil je dat sporters de les ook zelf in hun overzicht zien, zet ze dan in de
   workout onder "Deelnemers groepsles".

## Volgende periode uit Google Sheets

Exporteer elk tabblad als CSV (Bestand → Downloaden → CSV) in één map, bestandsnaam = naam van de les, en draai:

```bash
npm run import:groepslessen -- --csv ./pad/naar/csv-map --start 2027-03-08 --trainer-email …
```

De CSV-lezer herkent de koprijen `Week 1 … Week 10`, `Week 11 … Week 20`, `Week 21 … Week 26` en leest de
oefeningen per kolom.
