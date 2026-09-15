/**
 * Trainingen afleiden uit gelogde oefeningen.
 *
 * Waarom afleiden en niet apart bijhouden: het blok "Trainingen" op de Log-pagina vulde zich
 * alleen als iemand daar handmatig een training toevoegde. Een training die je in de app
 * doorloopt schreef er niets weg, dus stond het blok in de praktijk altijd leeg terwijl de
 * oefeningen er wél stonden. Een training ís precies dat: de oefeningen die je op één dag hebt
 * gelogd. Door ze te groeperen klopt het blok altijd, ook voor een sporter bij wie je meekijkt —
 * daar is geen aparte opslag voor nodig.
 *
 * Handmatig toegevoegde trainingslogs blijven meetellen. Hoort er één bij een dag waarop ook
 * oefeningen staan, dan levert hij de notitie; staat hij op zichzelf, dan blijft het een eigen
 * regel. Anders zou zo'n log stil verdwijnen zodra je hem toevoegt.
 */
import type { Exercise, TrainingSessionLog } from '../types';

export interface TrainingGroup {
  /** Sleutel van deze groep; stabiel genoeg om als React-key te gebruiken. */
  id: string;
  /** Datum van de training (YYYY-MM-DD). */
  date: string;
  /** Schema waar deze oefeningen bij horen, of null als ze los gelogd zijn. */
  schemaId: string | null;
  /** Welke dag van dat schema (0-based), of null. */
  schemaDayIndex: number | null;
  /** Namen van de oefeningen, in de volgorde waarin ze binnenkwamen, zonder dubbele. */
  exerciseNames: string[];
  /** Hoeveel oefeningen er in deze training zitten; 0 bij een los toegevoegd trainingslog. */
  exerciseCount: number;
  /** Notitie over de hele training, als die er is. */
  notes: string | null;
  /**
   * Id van het handmatig toegevoegde trainingslog achter deze groep, of null.
   * Alleen zo'n log is te bewerken of te verwijderen; een afgeleide groep bestaat niet als
   * document en verdwijnt vanzelf als de oefeningen weggaan.
   */
  sessionLogId: string | null;
}

/** Alleen de dag, zodat twee logs van dezelfde dag bij elkaar komen ongeacht het tijdstip. */
function dayOf(date: string): string {
  return typeof date === 'string' ? date.slice(0, 10) : '';
}

function keyOf(date: string, schemaId: string | null, schemaDayIndex: number | null): string {
  return `${date}|${schemaId ?? ''}|${schemaDayIndex ?? ''}`;
}

/**
 * Groepeert oefeningen tot trainingen, nieuwste eerst.
 *
 * Eén training = één dag én één schema-dag. Oefeningen zonder schema vormen per dag hun eigen
 * groep: wie 's ochtends een schema draait en 's avonds nog iets los logt, heeft die dag twee
 * trainingen gedaan en ziet er ook twee.
 *
 * @param sessionLogs Handmatig toegevoegde trainingslogs. Leveren de notitie bij een bestaande
 *   groep, of vormen zelf een groep zonder oefeningen. Laat leeg als je bij iemand anders
 *   meekijkt: die logs staan op diens eigen toestel.
 */
export function groupExercisesIntoTrainings(
  exercises: Exercise[],
  sessionLogs: TrainingSessionLog[] = []
): TrainingGroup[] {
  const groups = new Map<string, TrainingGroup>();

  for (const ex of exercises) {
    const date = dayOf(ex.date);
    if (!date) continue;
    const schemaId = ex.schemaId ?? null;
    const schemaDayIndex = schemaId ? ex.schemaDayIndex ?? null : null;
    const id = keyOf(date, schemaId, schemaDayIndex);

    let group = groups.get(id);
    if (!group) {
      group = { id, date, schemaId, schemaDayIndex, exerciseNames: [], exerciseCount: 0, notes: null, sessionLogId: null };
      groups.set(id, group);
    }
    group.exerciseCount += 1;
    const name = ex.name?.trim();
    if (name && !group.exerciseNames.includes(name)) group.exerciseNames.push(name);
  }

  for (const log of sessionLogs) {
    const date = dayOf(log.date);
    if (!date) continue;
    const note = log.notes?.trim() || null;
    const id = keyOf(date, log.schemaId || null, log.schemaId ? log.schemaDayIndex : null);
    const existing = groups.get(id);
    if (existing) {
      existing.notes = note;
      existing.sessionLogId = log.id;
      continue;
    }
    groups.set(id, {
      id,
      date,
      schemaId: log.schemaId || null,
      schemaDayIndex: log.schemaId ? log.schemaDayIndex : null,
      exerciseNames: [],
      exerciseCount: 0,
      notes: note,
      sessionLogId: log.id,
    });
  }

  // Nieuwste bovenaan; bij gelijke datum houdt het schema een vaste plek zodat de lijst niet
  // springt tussen twee renders.
  return [...groups.values()].sort((a, b) =>
    a.date === b.date ? a.id.localeCompare(b.id) : a.date > b.date ? -1 : 1
  );
}
