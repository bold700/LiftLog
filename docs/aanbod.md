# Aanbod: wie betaalt LiftLog, en waarvoor

Analyse vanuit revenue-strategie: wat lost LiftLog nu al op, hoe zou het geld kunnen binnenkomen, en wat ontbreekt om een nieuwe sporter zonder tussenkomst van Kenny te laten starten. Gebaseerd op de huidige code (geen betaal- of uitnodigingslogica aanwezig — zie hieronder), niet op aannames over een toekomstige roadmap.

## Wie betaalt: de trainer, niet de sporter

LiftLog is vandaag een **tool voor de trainer**, geen consumentenapp. De sporter kan zelf een account maken (`src/components/LoginPage.tsx`), maar komt dan als niet-gekoppelde sporter in het systeem: geen workout, geen trainer, geen waarde totdat een trainer het account koppelt en een schema toewijst (`src/services/profileService.ts:assignTrainerToSporter`, `src/components/BeheerPage.tsx`). De sporter kan de app dus niet op eigen kracht laten "werken" — de trainer is de enige die waarde activeert.

Dat bepaalt wie de rekening zou moeten krijgen: **de trainer**, per sporter die ze begeleiden of per abonnement op de tool zelf. Een sporter rechtstreeks laten betalen heeft geen natuurlijk aangrijpingspunt in de huidige flow — er is geen sporter-only functionaliteit die op zichzelf genoeg waarde biedt (voeding/meting-logging zonder toegewezen schema is dun).

## Waarvoor: welk probleem lost het nu al op

Voor de trainer (Van As Personal Training, en potentieel andere PT's):
- Schema's maken en toewijzen per sporter of groepsles, met AI-generatie en PDF-export (README.md).
- Voortgang zien zonder los Excel/WhatsApp-gedoe: sets/reps/gewicht, spiergroepen, hartslagzones, vetpercentage.
- Bodyscans (foto van weegschaal-uitdraai) automatisch uitgelezen en bewaard per sporter.
- Groepslessen met een halfjaarrooster, geïmporteerd uit het bestaande lesrooster.

Dit is het kernprobleem dat vandaag al wordt opgelost: **een trainer met veel sporters heeft geen overzichtelijke, centrale plek voor schema's, logs en voortgang**, en gebruikt nu waarschijnlijk een mix van losse tools (Excel, WhatsApp, papier). LiftLog vervangt die mix.

Voor de sporter is de waarde afgeleid: inzicht in eigen progressie en een schema in de broekzak in plaats van op papier — maar alleen nadat een trainer het account heeft opgezet.

## Hoe het geld zou binnenkomen: twee realistische modellen

Er is **geen betaalintegratie** in de code (geen Stripe/Mollie-package, geen prijslogica in `api/` of `src/`) en de App Store-checklists in `docs/archief/` noteren "Pricing: nog niet ingesteld". Dit is dus nog volledig open. Twee modellen passen bij de huidige structuur:

1. **Abonnement per maand, via de trainer.** De trainer betaalt een vast bedrag per maand voor toegang tot de tool, eventueel gestaffeld naar aantal actieve sporters (bv. tot 20 sporters, tot 50, onbeperkt). Past bij het huidige rollenmodel: `admin` (Kenny) beheert wie trainer-toegang heeft (`docs/ROLLEN-EN-RECHTEN.md`), dus een abonnementsstatus per trainer-account sluit daar natuurlijk op aan.
2. **Per begeleidingstraject.** De trainer (of Van As PT zelf) rekent per sporter per traject (bv. een 12-weken schema), en LiftLog neemt een vast bedrag of percentage daarvan. Vraagt meer boekhouding (wie zit in welk traject, wanneer loopt het af) en heeft geen aanknopingspunt in de huidige databronnen (`Profile`, `Workout` hebben geen traject- of einddatumveld) — dus duurder om te bouwen dan model 1.

**Advies:** start met model 1 (vast bedrag per maand per trainer-account, eventueel gestaffeld naar sporters). Het vraagt het minste nieuwe datamodel, sluit aan op het bestaande rollen- en goedkeuringssysteem, en is voor een trainer voorspelbaar te begroten.

## Wat ontbreekt om een nieuwe sporter zonder Kenny te laten starten

Vandaag loopt elke nieuwe sporter via een trainer of admin: de trainer maakt het account handmatig aan in Beheer (`BeheerPage.tsx`, met een gegenereerd wachtwoord) of de sporter registreert zelf maar blijft dan ongekoppeld tot een trainer ingrijpt. Om dit zonder Kenny (of een andere trainer) te laten draaien ontbreken drie dingen:

1. **Uitnodiging.** Geen link of code waarmee een sporter zichzelf aan een specifieke trainer koppelt. `AuthContext.register` accepteert al een `trainerId`-optie (`src/context/AuthContext.tsx:47`), maar `LoginPage.tsx` geeft die nooit door — er is geen scherm of URL-parameter die 'm invult.
2. **Eerste schema.** Na registratie staat de sporter zonder workout; er is geen automatische toewijzing van een standaardschema of intake-flow.
3. **Betaling.** Geen enkel punt in de registratie- of koppel-flow vraagt om een betaalmethode of activeert een abonnement — zie hierboven, dit bestaat nog nergens in de code.

## Drie vervolgtaken (elk een paar uur, met meetbaar resultaat)

1. **Uitnodigingslink met trainerId.** Voeg een `?trainer=<uid>`-parameter toe die `LoginPage.tsx` oppikt en doorgeeft aan `AuthContext.register` als `trainerId`. Trainer krijgt in Beheer een "Kopieer uitnodigingslink"-knop.
   *Meetbaar resultaat:* een sporter die via de link registreert, staat direct gekoppeld aan de juiste trainer in `profiles` — geen handmatige koppeling in Beheer meer nodig.
2. **Standaardschema bij registratie.** Laat de trainer één workout markeren als "standaard voor nieuwe sporters"; ken die automatisch toe zodra een sporter zich via de uitnodigingslink koppelt.
   *Meetbaar resultaat:* een nieuw gekoppelde sporter ziet binnen enkele seconden na registratie een workout in de app, zonder trainersactie.
3. **Prijsverkenning bij trainers.** Geen code — een kort gesprek (3–5 trainers, inclusief Van As PT) over: wat zou een maandbedrag per trainer-account acceptabel maken, en bij welk aantal sporters voelt staffelen eerlijk.
   *Meetbaar resultaat:* een prijspunt en staffelgrens, onderbouwd door minstens 3 concrete reacties, klaar om in model 1 te verwerken.
