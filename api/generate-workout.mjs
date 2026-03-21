import { getExerciseCatalog } from './exerciseCatalog.mjs';

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
// Robuust tegen onbedoelde extra tekst in .env (bijv. "gpt-4.1-mini (optioneel)")
const MODEL = (process.env.OPENAI_MODEL || 'gpt-4.1-mini').trim().split(/\s+/)[0];

const GOALS = new Set(['G', 'U', 'S', 'GU', 'GS', 'US', 'GUS']);
const MOVERS = new Set(['Non', 'Low', 'High']);
const ORGS = new Set(['FIETSEN', 'LOPEN', 'ROEIEN', 'CROSSTRAINEN', 'ANDERS']);
const COOLDOWN_ORGS = new Set(['FIETSEN', 'LOPEN']);
const STRENGTH_GOALS = new Set(['S1', 'S2', 'S3', 'S4', 'S4.1', 'S4.2', 'S4.3']);
const WEEK_TYPES = new Set(['TOTAL_BODY', 'SPLIT']);
const TB_VER = new Set(['A', 'B', 'C']);
const SPLIT_VAR = new Set(['UPPER_LOWER', 'UPPER_LOWER_AB']);
const DUR_CAT = new Set(['<30', '30-60', '>60']);
const EX_COUNTS = new Set([4, 6, 7, 8, 9]);

const exerciseCatalog = getExerciseCatalog();
const resolveExerciseName = (raw) => exerciseCatalog.resolve(raw);
const EXERCISE_CATALOG_APPEND =
  '\n\n=== LiftLog-oefencatalogus (VERPLICHT: alleen deze namen, exact zoals geschreven, voor exerciseName en formule7.neuromuscular.exercises[].name) ===\n' +
  (exerciseCatalog.catalogMarkdown || '(catalogus leeg — controleer mega_exercise_db.json op de server)') +
  '\n=== Einde catalogus ===\n';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 4000);
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampFloat(value, fallback, min, max) {
  const n = Number.parseFloat(String(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function extractText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const output = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === 'string' && part.text.trim()) {
        return part.text.trim();
      }
    }
  }
  return '';
}

function normalizeExercise(exercise) {
  const raw = typeof exercise?.exerciseName === 'string' ? exercise.exerciseName.trim() : '';
  const exerciseName = resolveExerciseName(raw);
  if (!exerciseName) return null;
  return {
    exerciseId: exerciseName,
    exerciseName,
    setsTarget: clampInt(exercise?.setsTarget, 3, 1, 10),
    repsTarget: clampInt(exercise?.repsTarget, 10, 1, 50),
    restSeconds: clampInt(exercise?.restSeconds, 60, 0, 600),
    notes: typeof exercise?.notes === 'string' ? exercise.notes.trim().slice(0, 240) : '',
  };
}

function normalizeDay(day, index) {
  const dayLabelRaw = typeof day?.dayLabel === 'string' ? day.dayLabel.trim() : '';
  const exercisesRaw = Array.isArray(day?.exercises) ? day.exercises : [];
  const exercises = exercisesRaw.map(normalizeExercise).filter(Boolean);
  if (!exercises.length) return null;
  return {
    dayLabel: dayLabelRaw || `Dag ${index + 1}`,
    exercises,
  };
}

function buildRationale(days, rationaleOverall, whyByDayRaw) {
  return {
    overall: rationaleOverall,
    whyByDay: days.map((d) => {
      const label = d.dayLabel;
      const found =
        whyByDayRaw.find(
          (x) => typeof x?.dayLabel === 'string' && x.dayLabel.trim() === label
        ) ?? null;
      const why =
        typeof found?.why === 'string' && found.why.trim()
          ? found.why.trim().slice(0, 600)
          : '';
      return { dayLabel: label, why };
    }),
  };
}

function pickEnum(value, allowedSet, fallback = null) {
  if (value == null) return fallback;
  const s = String(value).trim();
  return allowedSet.has(s) ? s : fallback;
}

function emptyZones() {
  return [
    { zone: 1, organisation: null, trainingHr: null, durationMinutes: null },
    { zone: 2, organisation: null, trainingHr: null, durationMinutes: null },
    { zone: 3, organisation: null, trainingHr: null, durationMinutes: null },
  ];
}

function normalizeFormule7(raw) {
  const f = raw && typeof raw === 'object' ? raw : {};
  const sessionsPerWeek = (() => {
    const n = clampInt(f.sessionsPerWeek, null, 1, 7);
    return n === null ? null : n;
  })();

  let weekschemaType = pickEnum(f.weekschemaType, WEEK_TYPES, null);
  if (!weekschemaType && sessionsPerWeek != null) {
    weekschemaType = sessionsPerWeek >= 4 ? 'SPLIT' : 'TOTAL_BODY';
  }

  const nm = f.neuromuscular && typeof f.neuromuscular === 'object' ? f.neuromuscular : {};
  const desiredRaw = nm.desiredExerciseCount;
  let desiredExerciseCount = null;
  if (desiredRaw != null) {
    const d = clampInt(desiredRaw, null, 4, 9);
    if (d != null && EX_COUNTS.has(d)) desiredExerciseCount = d;
  }

  const nmEx = Array.isArray(nm.exercises) ? nm.exercises : [];
  const neuromuscularExercises = nmEx
    .map((ex) => {
      const rawName = typeof ex?.name === 'string' ? ex.name.trim().slice(0, 200) : '';
      const name = resolveExerciseName(rawName);
      if (!name) return null;
      return {
        name,
        intensityPercent1RM:
          ex.intensityPercent1RM == null || ex.intensityPercent1RM === ''
            ? null
            : clampInt(ex.intensityPercent1RM, null, 30, 100),
        sets: ex.sets == null || ex.sets === '' ? null : clampInt(ex.sets, null, 1, 12),
        reps: ex.reps == null || ex.reps === '' ? null : clampInt(ex.reps, null, 1, 50),
        restSeconds:
          ex.restSeconds == null || ex.restSeconds === ''
            ? null
            : clampInt(ex.restSeconds, null, 0, 600),
      };
    })
    .filter(Boolean);

  const wu = f.warmup && typeof f.warmup === 'object' ? f.warmup : {};
  const cd = f.cooldown && typeof f.cooldown === 'object' ? f.cooldown : {};
  const ca = f.cardio && typeof f.cardio === 'object' ? f.cardio : {};
  const zonesIn = Array.isArray(ca.zones) ? ca.zones : [];
  const zones = emptyZones().map((z, i) => {
    const src = zonesIn[i] && typeof zonesIn[i] === 'object' ? zonesIn[i] : {};
    const zoneNum = clampInt(src.zone, z.zone, 1, 3);
    return {
      zone: zoneNum === 1 || zoneNum === 2 || zoneNum === 3 ? zoneNum : z.zone,
      organisation: pickEnum(src.organisation, ORGS, null),
      trainingHr: src.trainingHr == null || src.trainingHr === '' ? null : clampInt(src.trainingHr, null, 40, 220),
      durationMinutes:
        src.durationMinutes == null || src.durationMinutes === ''
          ? null
          : clampFloat(src.durationMinutes, null, 1, 180),
    };
  });

  const stretchIn = Array.isArray(f.stretching) ? f.stretching : [];
  const stretching = stretchIn
    .map((s) => {
      const muscleGroup = typeof s?.muscleGroup === 'string' ? s.muscleGroup.trim().slice(0, 80) : '';
      if (!muscleGroup) return null;
      return {
        muscleGroup,
        stretchDurationSeconds:
          s.stretchDurationSeconds == null || s.stretchDurationSeconds === ''
            ? null
            : clampInt(s.stretchDurationSeconds, null, 5, 600),
        repetitions: s.repetitions == null || s.repetitions === '' ? null : clampInt(s.repetitions, null, 1, 30),
      };
    })
    .filter(Boolean)
    .slice(0, 20);

  const normalized = {
    clientName: typeof f.clientName === 'string' ? f.clientName.trim().slice(0, 200) : '',
    casus: typeof f.casus === 'string' ? f.casus.trim().slice(0, 2000) : '',
    gender: pickEnum(f.gender, new Set(['M', 'V']), null),
    ageYears: f.ageYears == null || f.ageYears === '' ? null : clampInt(f.ageYears, null, 10, 100),
    moverType: pickEnum(f.moverType, MOVERS, null),
    goal: pickEnum(f.goal, GOALS, null),
    sessionsPerWeek,
    sessionDurationCategory: pickEnum(f.sessionDurationCategory, DUR_CAT, null),
    restingHr: f.restingHr == null || f.restingHr === '' ? null : clampInt(f.restingHr, null, 30, 120),
    theoreticalMaxHr:
      f.theoreticalMaxHr == null || f.theoreticalMaxHr === ''
        ? null
        : clampInt(f.theoreticalMaxHr, null, 100, 230),
    weekschemaType,
    totalBodyVersion: pickEnum(f.totalBodyVersion, TB_VER, null),
    splitVariant: pickEnum(f.splitVariant, SPLIT_VAR, null),
    warmup: {
      organisation: pickEnum(wu.organisation, ORGS, null),
      intensityPercentOfMaxHr:
        wu.intensityPercentOfMaxHr == null || wu.intensityPercentOfMaxHr === ''
          ? null
          : clampInt(wu.intensityPercentOfMaxHr, null, 40, 90),
      trainingHr: wu.trainingHr == null || wu.trainingHr === '' ? null : clampInt(wu.trainingHr, null, 40, 220),
      durationMinutes:
        wu.durationMinutes == null || wu.durationMinutes === ''
          ? null
          : clampFloat(wu.durationMinutes, null, 1, 60),
    },
    neuromuscular: {
      goal: pickEnum(nm.goal, STRENGTH_GOALS, null),
      trainingForm: typeof nm.trainingForm === 'string' ? nm.trainingForm.trim().slice(0, 500) : '',
      desiredExerciseCount,
      exercises: neuromuscularExercises,
    },
    cardio: {
      trainingMethod: typeof ca.trainingMethod === 'string' ? ca.trainingMethod.trim().slice(0, 500) : '',
      organisation: pickEnum(ca.organisation, ORGS, null),
      zones,
    },
    cooldown: {
      organisation: pickEnum(cd.organisation, COOLDOWN_ORGS, null),
      intensityPercentOfMaxHr:
        cd.intensityPercentOfMaxHr == null || cd.intensityPercentOfMaxHr === ''
          ? null
          : clampInt(cd.intensityPercentOfMaxHr, null, 40, 80),
      trainingHr: cd.trainingHr == null || cd.trainingHr === '' ? null : clampInt(cd.trainingHr, null, 40, 220),
      durationMinutes:
        cd.durationMinutes == null || cd.durationMinutes === ''
          ? null
          : clampFloat(cd.durationMinutes, null, 1, 40),
    },
    stretching,
    notes: typeof f.notes === 'string' ? f.notes.trim().slice(0, 2000) : '',
  };
  return fixWarmupVsCardio(normalized);
}

/** Warming-up mag niet dezelfde organisatie hebben als cardio (hoofd of zone). */
const WARMUP_ORGS_BY_MOVER = {
  Non: ['FIETSEN', 'LOPEN'],
  Low: ['FIETSEN', 'LOPEN', 'ROEIEN'],
  High: ['FIETSEN', 'LOPEN', 'ROEIEN', 'CROSSTRAINEN', 'ANDERS'],
};

function fixWarmupVsCardio(f7) {
  const mover = f7.moverType;
  const allowed = mover ? WARMUP_ORGS_BY_MOVER[mover] : null;
  if (!allowed?.length) return f7;
  const used = new Set();
  if (f7.cardio?.organisation) used.add(f7.cardio.organisation);
  for (const z of f7.cardio?.zones ?? []) {
    if (z?.organisation) used.add(z.organisation);
  }
  const w = f7.warmup?.organisation;
  if (!w || !used.has(w)) return f7;
  const alt = allowed.find((o) => !used.has(o));
  if (!alt) return f7;
  return {
    ...f7,
    warmup: { ...f7.warmup, organisation: alt },
  };
}

function enrichFormule7Days(days, formule7) {
  return days.map((d) => ({
    ...d,
    warmup: d.warmup ?? { ...formule7.warmup },
    cardio: d.cardio ?? { ...formule7.cardio, zones: formule7.cardio.zones.map((z) => ({ ...z })) },
    cooldown: d.cooldown ?? { ...formule7.cooldown },
    stretching:
      d.stretching?.length ? d.stretching : formule7.stretching.length
        ? formule7.stretching.map((s) => ({ ...s }))
        : [],
  }));
}

function hasAny(text, words) {
  return words.some((w) => text.includes(w));
}

function buildFormule7FollowUpQuestions(prompt, existingAnswers) {
  const existingText = Object.values(existingAnswers ?? {})
    .map((v) => String(v ?? '').toLowerCase())
    .join(' ');
  const text = `${String(prompt ?? '').toLowerCase()} ${existingText}`;
  const questions = [];
  const pushQ = (id, fieldKey, question) => {
    questions.push({ id, fieldKey, question });
  };

  if (!hasAny(text, ['man', 'vrouw', 'm ', ' v '])) {
    pushQ('gender', 'gender', 'Wat is het geslacht van de cliënt? (M of V)');
  }
  if (!hasAny(text, ['route g', 'route u', 'route s', 'route gu', 'route gs', 'route us', 'route gus'])) {
    pushQ('goal', 'goal', 'Welke Formule 7-route wil je volgen? (G, U, S, GU, GS, US of GUS)');
  }
  if (
    !hasAny(text, [
      'non mover',
      'low mover',
      'high mover',
      'lang niet',
      'jaar niet',
      'nauwelijks',
      'inactief',
      'soms sport',
      'af en toe',
      'regelmatig',
      'vaak sport',
      'veel train',
      'non',
      ' low ',
      ' high ',
    ])
  ) {
    pushQ(
      'moverType',
      'moverType',
      'Hoe actief is de cliënt? Kies: (A) lang niet gesport – langer dan een jaar niet of nauwelijks bewogen, (B) soms sport – af en toe, (C) vaak sport – regelmatig. Antwoord met Non, Low of High als je de codes wilt gebruiken.'
    );
  }
  if (!hasAny(text, ['keer per week', 'x per week', 'sessie', 'trainingen per week'])) {
    pushQ('sessionsPerWeek', 'sessionsPerWeek', 'Hoeveel sessies per week zijn haalbaar? (1 t/m 7)');
  }
  if (!hasAny(text, ['<30', '30-60', '>60', 'min', 'minuten'])) {
    pushQ('sessionDurationCategory', 'sessionDurationCategory', 'Wat is de sessieduur? (<30, 30-60 of >60 minuten)');
  }
  if (!hasAny(text, ['rust-hf', 'rust hf', 'resting', 'rusthartslag'])) {
    pushQ('restingHr', 'restingHr', 'Wat is de rusthartslag (bpm)?');
  }
  if (!hasAny(text, ['max-hf', 'max hf', 'maxhartslag', 'theoretical max'])) {
    pushQ('theoreticalMaxHr', 'theoreticalMaxHr', 'Wat is de (theoretische) maximale hartslag (bpm)?');
  }
  if (!hasAny(text, ['blessure', 'pijn', 'beperking', 'klacht'])) {
    pushQ('limitations', 'notes', 'Zijn er blessures of fysieke beperkingen waar we rekening mee moeten houden?');
  }
  if (!hasAny(text, ['dumbbell', 'halter', 'kabel', 'machine', 'materiaal', 'apparatuur', 'thuisgym'])) {
    pushQ('equipment', 'notes', 'Welke apparatuur is beschikbaar?');
  }
  if (!hasAny(text, ['ervaring', 'beginner', 'intermediate', 'gevorderd'])) {
    pushQ('experience', 'notes', 'Wat is het trainingsniveau? (beginner/intermediate/gevorderd)');
  }

  return questions.slice(0, 10);
}

const SYSTEM_FREE =
  'Je bent een strength coach. Geef ALLEEN geldige JSON terug, zonder markdown. ' +
  'Output schema: {"name":"string","rationale":{"overall":"string","whyByDay":[{"dayLabel":"string","why":"string"}]},"days":[{"dayLabel":"string","exercises":[{"exerciseName":"string","setsTarget":number,"repsTarget":number,"restSeconds":number,"notes":"string"}]}]}. ' +
  'Maak 1-7 dagen. Elke dag 1-12 oefeningen. Geen extra velden. ' +
  'exerciseName MOET exact één van de namen uit de catalogus hieronder zijn (geen eigen benamingen, geen vertalingen die niet in de lijst staan). ' +
  EXERCISE_CATALOG_APPEND;

const SYSTEM_FORMULE7 =
  'Je bent een opleidingsconforme fitnesscoach (Formule 7 / AALO). Geef ALLEEN geldige JSON terug, zonder markdown. ' +
  'Output schema: {"name":"string","rationale":{"overall":"string","whyByDay":[{"dayLabel":"string","why":"string"}]},"formule7":{' +
  '"clientName":"string","casus":"string","gender":"M"|"V"|null,"ageYears":number|null,' +
  '"moverType":"Non"|"Low"|"High"|null,"goal":"G"|"U"|"S"|"GU"|"GS"|"US"|"GUS"|null,' +
  '"sessionsPerWeek":1-7,"sessionDurationCategory":"<30"|"30-60"|">60"|null,' +
  '"restingHr":number|null,"theoreticalMaxHr":number|null,' +
  '"weekschemaType":"TOTAL_BODY"|"SPLIT"|null,"totalBodyVersion":"A"|"B"|"C"|null,"splitVariant":"UPPER_LOWER"|"UPPER_LOWER_AB"|null,' +
  '"warmup":{"organisation":"FIETSEN"|"LOPEN"|"ROEIEN"|"CROSSTRAINEN"|"ANDERS"|null,"intensityPercentOfMaxHr":number|null,"trainingHr":number|null,"durationMinutes":number|null},' +
  '"neuromuscular":{"goal":"S1"|"S2"|"S3"|"S4"|"S4.1"|"S4.2"|"S4.3"|null,"trainingForm":"string","desiredExerciseCount":4|6|7|8|9|null,' +
  '"exercises":[{"name":"string","intensityPercent1RM":number|null,"sets":number|null,"reps":number|null,"restSeconds":number|null}]},' +
  '"cardio":{"trainingMethod":"string","organisation":"FIETSEN"|"LOPEN"|"ROEIEN"|"CROSSTRAINEN"|"ANDERS"|null,' +
  '"zones":[{"zone":1,"organisation":null,"trainingHr":null,"durationMinutes":null},{"zone":2,...},{"zone":3,...}]},' +
  '"cooldown":{"organisation":"FIETSEN"|"LOPEN"|null,"intensityPercentOfMaxHr":number|null,"trainingHr":number|null,"durationMinutes":number|null},' +
  '"stretching":[{"muscleGroup":"string","stretchDurationSeconds":number|null,"repetitions":number|null}],' +
  '"notes":"string"' +
  '},"days":[{"dayLabel":"string","exercises":[{"exerciseName":"string","setsTarget":number,"repsTarget":number,"restSeconds":number,"notes":"string","intensityPercent1RM":number|null,"estimated1RMKg":number|null,"targetWeight":number|null}]}]}. ' +
  'Het aantal "days" moet exact gelijk zijn aan sessionsPerWeek (1-7). Maximaal 9 krachtoefeningen per dag. ' +
  'Vul per dag oefeningen in die passen bij die trainingsdag (split/total body). Gebruik Nederlandse labels waar logisch. Geen extra velden buiten dit schema. ' +
  'moverType (data): Non = lang niet gesport (≥ jaar niet of nauwelijks); Low = soms sport; High = vaak sport / regelmatig. ' +
  'warmup.organisation moet ALTIJD verschillen van cardio.organisation én van elke ingevulde cardio.zones[].organisation (andere oefenvorm voor warming-up kiezen). Cooling-down mag wél dezelfde organisatie hebben als cardio. ' +
  'days[].exercises[].exerciseName en formule7.neuromuscular.exercises[].name MOET exact overeenkomen met een naam uit de LiftLog-catalogus (zie onderaan); geen vrije oefennamen. ' +
  EXERCISE_CATALOG_APPEND;

async function callOpenAIRaw(systemInstruction, userPrompt, maxTokens) {
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.35,
      max_output_tokens: maxTokens,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: systemInstruction }] },
        { role: 'user', content: [{ type: 'input_text', text: userPrompt }] },
      ],
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI HTTP ${response.status}: ${text.slice(0, 400)}`);
  }
  const payload = await response.json();
  const raw = extractText(payload);
  if (!raw) throw new Error('Lege AI-respons');
  return raw;
}

function parseJsonLenient(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Geen geldige JSON in AI-respons');
  }
}

async function repairJson(rawText) {
  const fixerSystem =
    'Je bent een JSON reparateur. Geef ALLEEN geldige JSON terug zonder markdown of uitleg.';
  const fixerUser =
    'Herstel onderstaande ongeldige JSON naar geldige JSON met exact dezelfde betekenis.\\n\\n' +
    rawText.slice(0, 12000);
  const fixedRaw = await callOpenAIRaw(fixerSystem, fixerUser, 2200);
  return parseJsonLenient(fixedRaw);
}

async function callOpenAI(systemInstruction, userPrompt, maxTokens) {
  const raw = await callOpenAIRaw(systemInstruction, userPrompt, maxTokens);
  try {
    return parseJsonLenient(raw);
  } catch {
    // Tweede kans: model-output was geen geldige JSON, probeer te repareren.
    return repairJson(raw);
  }
}

function normalizeSchemaExerciseFromF7(ex) {
  const base = normalizeExercise(ex);
  if (!base) return null;
  const intensity =
    ex.intensityPercent1RM == null || ex.intensityPercent1RM === ''
      ? undefined
      : clampInt(ex.intensityPercent1RM, undefined, 30, 100);
  const est =
    ex.estimated1RMKg == null || ex.estimated1RMKg === ''
      ? undefined
      : clampFloat(ex.estimated1RMKg, undefined, 1, 500);
  const tw =
    ex.targetWeight == null || ex.targetWeight === ''
      ? undefined
      : clampFloat(ex.targetWeight, undefined, 0, 500);
  return {
    ...base,
    ...(intensity !== undefined && { intensityPercent1RM: intensity }),
    ...(est !== undefined && { estimated1RMKg: est }),
    ...(tw !== undefined && { targetWeight: tw }),
  };
}

function normalizeDayFormule7(day, index) {
  const dayLabelRaw = typeof day?.dayLabel === 'string' ? day.dayLabel.trim() : '';
  const exercisesRaw = Array.isArray(day?.exercises) ? day.exercises : [];
  const exercises = exercisesRaw.map(normalizeSchemaExerciseFromF7).filter(Boolean);
  if (!exercises.length) return null;
  return {
    dayLabel: dayLabelRaw || `Dag ${index + 1}`,
    exercises,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return json(res, 500, { error: 'OPENAI_API_KEY ontbreekt op de server.' });
  }

  const prompt = cleanText(req.body?.prompt);
  if (!prompt) {
    return json(res, 400, { error: 'Prompt is verplicht.' });
  }

  const modeRaw = String(req.body?.mode ?? 'free');
  const mode =
    modeRaw === 'formule7' || modeRaw === 'formule7_questions'
      ? modeRaw
      : 'free';

  try {
    if (mode === 'formule7_questions') {
      const existingAnswers =
        req.body?.existingAnswers && typeof req.body.existingAnswers === 'object'
          ? req.body.existingAnswers
          : {};
      const questions = buildFormule7FollowUpQuestions(prompt, existingAnswers);
      return json(res, 200, { questions });
    }

    if (!exerciseCatalog.names.length) {
      return json(res, 500, {
        error:
          'Oefencatalogus niet geladen. Controleer of src/data/mega_exercise_db.json op de server beschikbaar is.',
      });
    }

    const parsed =
      mode === 'formule7'
        ? await callOpenAI(SYSTEM_FORMULE7, prompt, 3800)
        : await callOpenAI(SYSTEM_FREE, prompt, 1600);

    const name =
      typeof parsed?.name === 'string' && parsed.name.trim()
        ? parsed.name.trim().slice(0, 120)
        : mode === 'formule7'
          ? 'Formule 7 workout'
          : 'AI Workout';

    const rationaleOverall =
      typeof parsed?.rationale?.overall === 'string' && parsed.rationale.overall.trim()
        ? parsed.rationale.overall.trim().slice(0, 1200)
        : '';
    const whyByDayRaw = Array.isArray(parsed?.rationale?.whyByDay) ? parsed.rationale.whyByDay : [];

    if (mode === 'formule7') {
      const formule7 = normalizeFormule7(parsed.formule7);
      const daysRaw = Array.isArray(parsed?.days) ? parsed.days : [];
      let days = daysRaw.map(normalizeDayFormule7).filter(Boolean).slice(0, 7);

      if (!days.length) {
        return json(res, 422, {
          error:
            'Geen bruikbare trainingsdagen: elke oefening moet een naam uit de LiftLog-oefencatalogus hebben (zie mega_exercise_db). Probeer opnieuw of vul handmatig aan.',
        });
      }

      days = enrichFormule7Days(days, formule7);
      const rationale = buildRationale(days, rationaleOverall, whyByDayRaw);

      return json(res, 200, { name, days, formule7, rationale });
    }

    const daysRaw = Array.isArray(parsed?.days) ? parsed.days : [];
    const days = daysRaw.map(normalizeDay).filter(Boolean).slice(0, 7);

    if (!days.length) {
      return json(res, 422, {
        error:
          'Geen bruikbare workout: oefennamen moeten exact uit de LiftLog-database komen. Probeer de prompt opnieuw of kies oefeningen handmatig.',
      });
    }

    const rationale = buildRationale(days, rationaleOverall, whyByDayRaw);

    return json(res, 200, { name, days, rationale });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.startsWith('OpenAI HTTP')) {
      return json(res, 502, { error: 'OpenAI API gaf een fout terug.', details: msg.slice(0, 600) });
    }
    return json(res, 500, {
      error: 'Onverwachte serverfout bij workoutgeneratie.',
      details: msg,
    });
  }
}
