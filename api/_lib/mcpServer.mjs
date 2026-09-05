/**
 * LiftLog MCP-server: de tools die ChatGPT, Claude en Gemini kunnen aanroepen.
 * `ctx` = de ingelogde gebruiker (via koppelsleutel); `store` = datalaag (zie liftlogData.mjs).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { todayNl, scheduleWeekFor, weekdayIndex } from './liftlogData.mjs';

const ROLE_LABEL = { sporter: 'sporter', trainer: 'trainer', admin: 'beheerder' };

function text(payload) {
  return { content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 1) }] };
}

function fail(message) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function norm(s) {
  return String(s ?? '').trim().toLowerCase();
}

function displayName(p) {
  return p.displayName?.trim() || p.email || p.userId;
}

/** Datum-invoer normaliseren: leeg = vandaag; anders YYYY-MM-DD. */
function dateOrToday(d) {
  const t = String(d ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : todayNl();
}

/**
 * Bepaalt welke schemadag "aan de beurt" is: de dag na de laatst gelogde dag van dit schema (cyclisch).
 * Zonder logs: dag 0. Als de laatste log van vandaag is, is die dag zelf "vandaag".
 */
function nextDayIndex(schema, logs) {
  const own = logs.filter((l) => l.schemaId === schema.id && l.schemaDayIndex != null);
  if (!own.length || !schema.days.length) return { index: 0, startedToday: false, lastDate: null };
  const last = own[0]; // logs zijn nieuwste eerst
  const lastDate = last.date.slice(0, 10);
  if (lastDate === todayNl()) return { index: last.schemaDayIndex % schema.days.length, startedToday: true, lastDate };
  return { index: (last.schemaDayIndex + 1) % schema.days.length, startedToday: false, lastDate };
}

const WEEKDAYS = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

/** Datum n dagen vanaf vandaag, als YYYY-MM-DD. */
function dayOffset(days) {
  const d = new Date(`${todayNl()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Zet "morgen", "zondag" of "2026-09-06" om naar een datum (YYYY-MM-DD).
 * Een weekdagnaam betekent de eerstvolgende keer dat die dag valt, vandaag meegerekend.
 */
function resolveDate(input) {
  const t = String(input ?? '').trim().toLowerCase();
  if (!t) return todayNl();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (t === 'vandaag') return todayNl();
  if (t === 'morgen') return dayOffset(1);
  if (t === 'overmorgen') return dayOffset(2);
  if (t === 'gisteren') return dayOffset(-1);
  const wanted = WEEKDAYS.findIndex((d) => t.includes(d));
  if (wanted >= 0) {
    const diff = (wanted - weekdayIndex(todayNl()) + 7) % 7;
    return dayOffset(diff);
  }
  return todayNl();
}

/** Is dit een groepsles (categorie "Groepslessen" of audience "group")? */
function isGroupClass(s) {
  return String(s.category ?? '').toLowerCase().includes('groepsles') || s.audience === 'group';
}

/**
 * Schema's die voor deze persoon zélf bedoeld zijn. Een trainer maakt schema's voor sporters
 * ('authored'); die zijn niet zijn eigen training en tellen hier dus niet mee.
 */
function ownSchemas(schemas) {
  return schemas.filter((s) => s.source !== 'authored');
}

/** Kies het actieve schema: binnen start/einddatum, anders het nieuwste. */
function pickActiveSchema(schemas) {
  const today = todayNl();
  const active = schemas.filter((s) => (!s.startDate || s.startDate <= today) && (!s.endDate || s.endDate >= today));
  return (active.length ? active : schemas)[0] ?? null;
}

function lastPerExercise(logs) {
  const map = new Map();
  for (const l of logs) {
    const k = norm(l.exerciseName);
    if (!map.has(k)) map.set(k, l);
  }
  return map;
}

export function buildServer(ctx, store) {
  const me = ctx.profile;
  const isStaff = me.role === 'trainer' || me.role === 'admin';

  const server = new McpServer(
    { name: 'liftlog', version: '1.0.0' },
    {
      instructions: [
        `Je bent gekoppeld aan LiftLog, de trainingsapp van Van As Personal Training.`,
        `De ingelogde gebruiker is ${displayName(me)} (${ROLE_LABEL[me.role]}). Vandaag is ${todayNl()} (Nederlandse tijd).`,
        `Antwoord in het Nederlands, kort en praktisch, alsof je in de sportschool naast iemand staat.`,
        `Gewichten in kg. Gebruik "log_exercise" pas als de gebruiker duidelijk sets heeft gedaan en die wil vastleggen.`,
        isStaff
          ? `Als trainer mag je ook data van je sporters opvragen en loggen: geef dan de parameter "athlete" (naam of e-mail) mee. Zonder "athlete" gaat het over de trainer zelf.`
          : `Deze gebruiker kan alleen eigen data zien en loggen.`,
      ].join(' '),
    }
  );

  const athleteParam = isStaff
    ? { athlete: z.string().optional().describe('Alleen voor trainers: naam of e-mail van de sporter. Weglaten = jezelf.') }
    : {};

  /**
   * Bepaal over wie het gaat en controleer rechten.
   * Een trainer komt alleen bij zichzelf en bij zijn eigen sporters; alleen een beheerder bij iedereen.
   * Een sporter komt nooit bij een ander (die heeft de parameter `athlete` niet eens).
   */
  async function resolveTarget(athlete) {
    const q = norm(athlete);
    if (!q) return me;
    if (!isStaff) throw new Error('Je kunt alleen je eigen gegevens bekijken.');
    const all = await store.getAllProfiles();
    const reachable = me.role === 'admin' ? all : all.filter((p) => p.userId === me.userId || p.trainerId === me.userId);
    const exact = reachable.find((p) => norm(p.email) === q || norm(p.displayName) === q);
    const partial = exact ? [exact] : reachable.filter((p) => norm(p.displayName).includes(q) || norm(p.email).includes(q));
    if (partial.length === 1) return partial[0];
    if (partial.length === 0) {
      throw new Error(
        me.role === 'admin'
          ? `Geen sporter gevonden die lijkt op "${athlete}".`
          : `Geen sporter van jou gevonden die lijkt op "${athlete}". Je kunt alleen bij sporters die aan jou zijn gekoppeld.`
      );
    }
    throw new Error(`Meerdere sporters gevonden voor "${athlete}": ${partial.map(displayName).join(', ')}. Wees specifieker.`);
  }

  function withTarget(fn) {
    return async (args) => {
      try {
        const target = await resolveTarget(args?.athlete);
        return await fn(target, args ?? {});
      } catch (e) {
        return fail(e instanceof Error ? e.message : 'Er ging iets mis.');
      }
    };
  }

  server.registerTool(
    'get_profile',
    {
      title: 'Profiel',
      description: 'Profiel en doelen van de gebruiker (of van een sporter, voor trainers): naam, rol, lengte, doelgewicht, voedingsdoel, trainer.',
      inputSchema: { ...athleteParam },
    },
    withTarget(async (t) => {
      const trainer = t.trainerId ? await store.getProfile(t.trainerId) : null;
      const meas = await store.getMeasurements(t.userId);
      const lastWeight = [...meas].reverse().find((m) => m.weightKg != null) ?? null;
      return text({
        name: displayName(t),
        role: ROLE_LABEL[t.role],
        email: t.email,
        gender: t.gender,
        birthDate: t.birthDate,
        heightCm: t.heightCm,
        restingHrBpm: t.restingHrBpm,
        weightGoalKg: t.weightGoalKg,
        lastWeightKg: lastWeight?.weightKg ?? null,
        lastWeightDate: lastWeight?.date ?? null,
        nutritionGoal: t.nutritionGoal,
        trainer: trainer ? displayName(trainer) : null,
      });
    })
  );

  server.registerTool(
    'get_todays_workout',
    {
      title: 'Workout van vandaag',
      description:
        'De training die vandaag aan de beurt is: het actieve schema, welke trainingsdag, en per oefening de doel-sets/reps/gewicht plus wat de vorige keer is gelogd. Gebruik dit bij "wat is mijn workout vandaag".',
      inputSchema: { ...athleteParam },
    },
    withTarget(async (t) => {
      const all = await store.getSchemasForUser(t.userId, t.role);
      const schemas = ownSchemas(all);
      if (!schemas.length) {
        // Geen eigen training: wijs een trainer door naar zijn groepslessen en sporters.
        const today = todayNl();
        const week = scheduleWeekFor(today);
        const wd = weekdayIndex(today);
        const classesToday = all
          .filter((s) => isGroupClass(s) && s.scheduleWeek === week && (s.seriesOrder === wd || norm(s.series).includes(WEEKDAYS[wd])))
          .map((s) => s.name);
        return text({
          message:
            all.length > 0
              ? `${displayName(t)} heeft zelf geen trainingsschema toegewezen gekregen; de schema's die deze trainer voor sporters en groepslessen maakte tellen niet als eigen training. Gebruik "athlete" voor de workout van een sporter, of "get_class_workout" voor een groepsles.`
              : `${displayName(t)} heeft nog geen trainingsschema. Vraag je trainer om er een te maken.`,
          groupClassesToday: classesToday,
          scheduleWeek: week,
        });
      }
      const logs = await store.getLogsForUser(t.userId);
      const schema = pickActiveSchema(schemas);
      const { index, startedToday, lastDate } = nextDayIndex(schema, logs);
      const day = schema.days[index];
      const last = lastPerExercise(logs);
      return text({
        schemaId: schema.id,
        schemaName: schema.name,
        dayIndex: index,
        dayLabel: day?.dayLabel ?? `Dag ${index + 1}`,
        totalDays: schema.days.length,
        status: startedToday ? 'Vandaag al mee begonnen (er zijn logs van vandaag).' : lastDate ? `Vorige training: ${lastDate}.` : 'Nog geen eerdere logs.',
        warmup: day?.warmup ?? null,
        exercises: (day?.exercises ?? []).map((e) => {
          const prev = last.get(norm(e.exerciseName));
          return {
            name: e.exerciseName,
            targetSets: e.setsTarget,
            targetReps: e.repsTarget,
            targetWeightKg: e.targetWeight ?? null,
            restSeconds: e.restSeconds ?? null,
            notes: e.notes || null,
            lastTime: prev ? { date: prev.date.slice(0, 10), weightKg: prev.weight, sets: prev.sets, reps: prev.reps, notes: prev.notes } : null,
          };
        }),
        cardio: day?.cardio ?? null,
        cooldown: day?.cooldown ?? null,
        otherSchemas: schemas.filter((s) => s.id !== schema.id).map((s) => ({ id: s.id, name: s.name })),
      });
    })
  );

  server.registerTool(
    'get_workout_plan',
    {
      title: 'Volledig schema',
      description: 'Alle trainingsdagen van het actieve schema (of een specifiek schema op id) met oefeningen en doelen.',
      inputSchema: { ...athleteParam, schemaId: z.string().optional().describe('Schema-id; weglaten = het actieve schema.') },
    },
    withTarget(async (t, args) => {
      const all = await store.getSchemasForUser(t.userId, t.role);
      const schema = args.schemaId ? all.find((s) => s.id === args.schemaId) : pickActiveSchema(ownSchemas(all));
      if (!schema) return text({ message: 'Geen schema gevonden.' });
      return text({
        schemaId: schema.id,
        schemaName: schema.name,
        startDate: schema.startDate,
        endDate: schema.endDate,
        days: schema.days.map((d, i) => ({
          dayIndex: i,
          dayLabel: d.dayLabel,
          exercises: (d.exercises ?? []).map((e) => ({
            name: e.exerciseName, targetSets: e.setsTarget, targetReps: e.repsTarget, targetWeightKg: e.targetWeight ?? null, notes: e.notes || null,
          })),
        })),
      });
    })
  );

  server.registerTool(
    'log_exercise',
    {
      title: 'Oefening loggen',
      description:
        'Legt een gedane oefening vast: naam, gewicht (kg), sets en reps, optioneel een notitie. Koppelt automatisch aan de schemadag van vandaag als de oefening daarin voorkomt.',
      inputSchema: {
        ...athleteParam,
        exercise: z.string().min(1).describe('Naam van de oefening, bijv. "Bankdrukken".'),
        weightKg: z.number().nonnegative().optional().describe('Gewicht in kg (0 of weglaten bij lichaamsgewicht).'),
        sets: z.number().int().positive().optional(),
        reps: z.number().int().positive().optional(),
        notes: z.string().optional().describe('Bijv. "ging goed" of "last van schouder".'),
        date: z.string().optional().describe('YYYY-MM-DD; weglaten = vandaag.'),
      },
    },
    withTarget(async (t, args) => {
      const schemas = ownSchemas(await store.getSchemasForUser(t.userId, t.role));
      const logs = await store.getLogsForUser(t.userId);
      let schemaId = null;
      let schemaDayIndex = null;
      let exerciseName = args.exercise.trim();
      const schema = pickActiveSchema(schemas);
      if (schema) {
        const { index } = nextDayIndex(schema, logs);
        const order = [index, ...schema.days.map((_, i) => i).filter((i) => i !== index)];
        outer: for (const i of order) {
          for (const e of schema.days[i]?.exercises ?? []) {
            if (norm(e.exerciseName) === norm(exerciseName) || norm(e.exerciseName).includes(norm(exerciseName))) {
              schemaId = schema.id;
              schemaDayIndex = i;
              exerciseName = e.exerciseName;
              break outer;
            }
          }
        }
      }
      const date = dateOrToday(args.date);
      const nowIso = new Date().toISOString();
      const dateIso = date === todayNl() ? nowIso : `${date}T12:00:00.000Z`;
      const saved = await store.saveLog({
        userId: t.userId,
        loggedBy: me.userId,
        trainerId: t.trainerId ?? null,
        exerciseName,
        exerciseId: null,
        weight: args.weightKg ?? null,
        sets: args.sets ?? null,
        reps: args.reps ?? null,
        notes: args.notes?.trim() || null,
        date: dateIso,
        schemaId,
        schemaDayIndex,
        sessionId: null,
      });
      return text({
        ok: true,
        logged: { exercise: exerciseName, weightKg: saved.weight, sets: saved.sets, reps: saved.reps, date, forAthlete: displayName(t) },
        linkedToSchema: schemaId ? { schemaName: schema.name, dayIndex: schemaDayIndex } : null,
      });
    })
  );

  server.registerTool(
    'get_recent_logs',
    {
      title: 'Recente trainingslogs',
      description: 'Gelogde oefeningen van de afgelopen dagen (standaard 7), nieuwste eerst. Handig voor "hoe ging het deze week" of progressie per oefening.',
      inputSchema: {
        ...athleteParam,
        days: z.number().int().positive().max(365).optional().describe('Aantal dagen terug, standaard 7.'),
        exercise: z.string().optional().describe('Alleen deze oefening (deel van de naam mag).'),
      },
    },
    withTarget(async (t, args) => {
      const days = args.days ?? 7;
      const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      const logs = (await store.getLogsForUser(t.userId)).filter((l) => l.date.slice(0, 10) >= cutoff);
      const filtered = args.exercise ? logs.filter((l) => norm(l.exerciseName).includes(norm(args.exercise))) : logs;
      return text({
        athlete: displayName(t),
        days,
        count: filtered.length,
        logs: filtered.slice(0, 100).map((l) => ({ date: l.date.slice(0, 10), exercise: l.exerciseName, weightKg: l.weight, sets: l.sets, reps: l.reps, notes: l.notes })),
      });
    })
  );

  server.registerTool(
    'search_food',
    {
      title: 'Voedingsmiddel zoeken',
      description: 'Zoekt een product in Open Food Facts en geeft voedingswaarden per 100 g. Gebruik dit vóór log_nutrition als de macro\'s niet bekend zijn.',
      inputSchema: { query: z.string().min(2).describe('Bijv. "Skyr" of "kipfilet".') },
    },
    async ({ query }) => {
      try {
        const url =
          'https://world.openfoodfacts.org/cgi/search.pl?' +
          new URLSearchParams({ search_terms: query, search_simple: '1', action: 'process', json: '1', page_size: '8', fields: 'code,product_name,brands,nutriments,serving_size' });
        const res = await fetch(url, { headers: { 'User-Agent': 'LiftLog MCP/1.0' } });
        if (!res.ok) return fail('Open Food Facts reageert niet.');
        const data = await res.json();
        const products = (data.products ?? [])
          .map((p) => {
            const n = p.nutriments ?? {};
            const kcal = Number(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0);
            return {
              name: p.product_name || '',
              brand: p.brands || '',
              per100g: { kcal: Math.round(kcal), protein: Number(n.proteins_100g ?? 0), carbs: Number(n.carbohydrates_100g ?? 0), fat: Number(n.fat_100g ?? 0) },
              servingSize: p.serving_size || null,
            };
          })
          .filter((p) => p.name && p.per100g.kcal > 0);
        return text({ query, results: products.slice(0, 5) });
      } catch (e) {
        return fail(e instanceof Error ? e.message : 'Zoeken mislukt.');
      }
    }
  );

  server.registerTool(
    'log_nutrition',
    {
      title: 'Voeding loggen',
      description:
        'Legt een gegeten product vast met hoeveelheid in gram en de macro\'s voor die hoeveelheid (niet per 100 g). Schat de macro\'s zelf als de gebruiker ze niet weet, en zeg dat erbij.',
      inputSchema: {
        ...athleteParam,
        productName: z.string().min(1),
        brand: z.string().optional(),
        grams: z.number().positive(),
        kcal: z.number().nonnegative(),
        protein: z.number().nonnegative().describe('Eiwit in gram voor deze portie.'),
        carbs: z.number().nonnegative().describe('Koolhydraten in gram voor deze portie.'),
        fat: z.number().nonnegative().describe('Vet in gram voor deze portie.'),
        date: z.string().optional().describe('YYYY-MM-DD; weglaten = vandaag.'),
      },
    },
    withTarget(async (t, args) => {
      const date = dateOrToday(args.date);
      await store.saveNutritionLog({
        userId: t.userId,
        loggedBy: me.userId,
        trainerId: t.trainerId ?? null,
        date,
        productName: args.productName.trim(),
        brand: args.brand?.trim() ?? '',
        grams: args.grams,
        kcal: Math.round(args.kcal),
        protein: Math.round(args.protein * 10) / 10,
        carbs: Math.round(args.carbs * 10) / 10,
        fat: Math.round(args.fat * 10) / 10,
      });
      const day = await store.getNutritionForDay(t.userId, date);
      const totals = day.reduce((a, l) => ({ kcal: a.kcal + l.kcal, protein: a.protein + l.protein, carbs: a.carbs + l.carbs, fat: a.fat + l.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
      return text({ ok: true, date, forAthlete: displayName(t), dayTotals: totals, goal: t.nutritionGoal });
    })
  );

  server.registerTool(
    'get_nutrition_day',
    {
      title: 'Voeding van een dag',
      description: 'Alles wat op een dag is gelogd plus dagtotalen en het voedingsdoel. Gebruik dit bij "hoeveel eiwit heb ik vandaag gehad".',
      inputSchema: { ...athleteParam, date: z.string().optional().describe('YYYY-MM-DD; weglaten = vandaag.') },
    },
    withTarget(async (t, args) => {
      const date = dateOrToday(args.date);
      const day = await store.getNutritionForDay(t.userId, date);
      const totals = day.reduce((a, l) => ({ kcal: a.kcal + l.kcal, protein: a.protein + l.protein, carbs: a.carbs + l.carbs, fat: a.fat + l.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
      return text({
        athlete: displayName(t),
        date,
        totals,
        goal: t.nutritionGoal,
        remaining: t.nutritionGoal
          ? { kcal: t.nutritionGoal.kcal - totals.kcal, protein: Math.round((t.nutritionGoal.protein - totals.protein) * 10) / 10 }
          : null,
        items: day.map((l) => ({ product: l.productName, brand: l.brand || null, grams: l.grams, kcal: l.kcal, protein: l.protein, carbs: l.carbs, fat: l.fat })),
      });
    })
  );

  server.registerTool(
    'log_measurement',
    {
      title: 'Gewicht of meting loggen',
      description: 'Legt lichaamsgewicht (kg) en/of vetpercentage en/of taille (cm) vast op een datum.',
      inputSchema: {
        ...athleteParam,
        weightKg: z.number().positive().optional(),
        bodyFatPct: z.number().positive().max(70).optional(),
        waistCm: z.number().positive().optional(),
        note: z.string().optional(),
        date: z.string().optional().describe('YYYY-MM-DD; weglaten = vandaag.'),
      },
    },
    withTarget(async (t, args) => {
      if (args.weightKg == null && args.bodyFatPct == null && args.waistCm == null) return fail('Geef minstens gewicht, vetpercentage of taille op.');
      const date = dateOrToday(args.date);
      await store.saveMeasurement({
        userId: t.userId,
        loggedBy: me.userId,
        trainerId: t.trainerId ?? null,
        date,
        weightKg: args.weightKg ?? null,
        bodyFatPct: args.bodyFatPct ?? null,
        waistCm: args.waistCm ?? null,
        bodyFatMethod: args.bodyFatPct != null ? 'manual' : null,
        note: args.note?.trim() ?? '',
      });
      return text({ ok: true, date, forAthlete: displayName(t), weightKg: args.weightKg ?? null, bodyFatPct: args.bodyFatPct ?? null, waistCm: args.waistCm ?? null, goalWeightKg: t.weightGoalKg });
    })
  );

  server.registerTool(
    'get_progress',
    {
      title: 'Voortgang',
      description: 'Gewicht- en vetpercentageverloop (laatste metingen, oud naar nieuw) plus doelgewicht.',
      inputSchema: { ...athleteParam, limit: z.number().int().positive().max(100).optional().describe('Aantal metingen, standaard 12.') },
    },
    withTarget(async (t, args) => {
      const all = await store.getMeasurements(t.userId);
      const recent = all.slice(-(args.limit ?? 12));
      const first = recent[0];
      const lastM = recent[recent.length - 1];
      return text({
        athlete: displayName(t),
        goalWeightKg: t.weightGoalKg,
        change: first && lastM && first.weightKg != null && lastM.weightKg != null ? { fromDate: first.date, toDate: lastM.date, weightKg: Math.round((lastM.weightKg - first.weightKg) * 10) / 10 } : null,
        measurements: recent.map((m) => ({ date: m.date, weightKg: m.weightKg, bodyFatPct: m.bodyFatPct, waistCm: m.waistCm, note: m.note || null })),
      });
    })
  );

  if (isStaff) {
    server.registerTool(
      'create_account',
      {
        title: 'Account aanmaken',
        description:
          'Maakt een nieuw LiftLog-account aan voor een sporter of trainer, met een tijdelijk wachtwoord dat je één keer terugkrijgt en aan de persoon doorgeeft. E-mailverificatie is niet nodig; de gebruiker kan meteen inloggen en het wachtwoord later zelf wijzigen. Vraag altijd eerst om een echt e-mailadres en een naam: verzin die nooit zelf, want een verkeerd adres levert een account op dat niemand kan gebruiken. Beheerdersaccounts maak je niet hier maar in de app.',
        inputSchema: {
          email: z.string().email().describe('Het echte e-mailadres van de persoon; hiermee logt hij in.'),
          name: z.string().min(1).describe('Volledige naam, bijv. "Jan Jansen".'),
          role: z.enum(['sporter', 'trainer']).optional().describe('Standaard "sporter".'),
          trainer: z
            .string()
            .optional()
            .describe('Alleen bij een sporter: naam of e-mail van de trainer. Weglaten = jijzelf. Geef "geen" voor geen trainer.'),
        },
      },
      async (args) => {
        try {
          const role = args.role ?? 'sporter';
          let trainerId = me.userId;
          if (role === 'sporter' && args.trainer) {
            const q = norm(args.trainer);
            if (q === 'geen' || q === 'none') {
              trainerId = null;
            } else {
              const all = await store.getAllProfiles();
              const hits = all.filter(
                (p) => (p.role === 'trainer' || p.role === 'admin') && (norm(p.displayName).includes(q) || norm(p.email).includes(q))
              );
              if (hits.length !== 1) {
                return fail(
                  hits.length === 0
                    ? `Geen trainer gevonden die lijkt op "${args.trainer}".`
                    : `Meerdere trainers gevonden voor "${args.trainer}": ${hits.map(displayName).join(', ')}.`
                );
              }
              trainerId = hits[0].userId;
            }
          }
          const created = await store.createAccount({ email: args.email, displayName: args.name.trim(), role, trainerId });
          return text({
            ok: true,
            name: args.name.trim(),
            email: created.email,
            role,
            temporaryPassword: created.password,
            note: 'Geef dit wachtwoord door aan de gebruiker; het is hierna niet meer op te vragen. Hij kan meteen inloggen en het zelf wijzigen.',
          });
        } catch (e) {
          return fail(e instanceof Error ? e.message : 'Account aanmaken mislukt.');
        }
      }
    );

    server.registerTool(
      'create_workout',
      {
        title: 'Workout aanmaken',
        description:
          'Maakt een nieuw trainingsschema aan in LiftLog en wijst het toe aan een sporter, of aan jezelf als je geen sporter noemt. Gebruik dit als de gebruiker vraagt om een programma "in de app te zetten". Maakt altijd een nieuw schema; bestaande schema\'s worden nooit overschreven of gewijzigd. Vul per oefening sets en herhalingen in; laat gewicht leeg als dat nog niet vaststaat.',
        inputSchema: {
          name: z.string().min(1).describe('Naam van het schema, bijv. "Full body kracht - 12 weken".'),
          ...athleteParam,
          days: z
            .array(
              z.object({
                dayLabel: z.string().min(1).describe('Naam van de trainingsdag, bijv. "Dag A - Full body".'),
                exercises: z
                  .array(
                    z.object({
                      name: z
                        .string()
                        .min(1)
                        .describe(
                          'Gebruik de gangbare Engelse naam van de oefening, zoals "Farmer\'s Carry", "Dumbbell Step Up", "Pallof Press" of "Dead Bug". De app zoekt de demo-animatie op die naam, dus vrije of Nederlandse omschrijvingen leveren geen plaatje op.'
                        ),
                      sets: z.number().int().positive().max(20),
                      reps: z.number().int().positive().max(200),
                      weightKg: z.number().nonnegative().max(1000).optional(),
                      restSeconds: z.number().int().nonnegative().max(3600).optional(),
                      notes: z.string().max(500).optional().describe('Bijv. "Superset met Pull-Up" of een techniekaanwijzing.'),
                    })
                  )
                  .min(1)
                  .max(40),
              })
            )
            .min(1)
            .max(14)
            .describe('De trainingsdagen van het schema, in volgorde.'),
        },
      },
      withTarget(async (t, args) => {
        const schema = {
          name: args.name.trim(),
          trainerId: me.userId,
          clientId: t.userId,
          audience: 'single',
          participantIds: [],
          category: null,
          series: null,
          seriesOrder: null,
          scheduleWeek: null,
          startDate: null,
          endDate: null,
          formule7: null,
          isFormule7Template: false,
          days: args.days.map((d) => ({
            dayLabel: d.dayLabel.trim(),
            exercises: d.exercises.map((e) => ({
              exerciseId: '',
              exerciseName: e.name.trim(),
              setsTarget: e.sets,
              repsTarget: e.reps,
              ...(e.weightKg != null ? { targetWeight: e.weightKg } : {}),
              ...(e.restSeconds != null ? { restSeconds: e.restSeconds } : {}),
              notes: e.notes?.trim() ?? '',
            })),
          })),
        };
        const saved = await store.saveSchema(schema);
        return text({
          ok: true,
          schemaId: saved.id,
          name: saved.name,
          forAthlete: displayName(t),
          days: saved.days.map((d) => ({ dayLabel: d.dayLabel, exerciseCount: d.exercises.length })),
          note: 'Het schema staat nu in LiftLog onder Workouts. Wijzigen of verwijderen doe je in de app.',
        });
      })
    );
  }

  server.registerTool(
    'get_class_workout',
    {
      title: 'Groepsles opzoeken',
      description:
        'De oefeningen van een groepsles op een bepaalde dag. Gebruik dit bij vragen als "wat is de les van morgen", "wat staat er zondag op het programma" of "welke groepsles is er woensdag". De juiste schemaweek wordt automatisch bepaald uit het weeknummer van de kalender, dus niet uit de naam van het schema.',
      inputSchema: {
        date: z.string().optional().describe('YYYY-MM-DD, of "vandaag" / "morgen" / een weekdag zoals "zondag". Weglaten = vandaag.'),
        series: z.string().optional().describe('Lesmoment, bijv. "Woensdag ochtend". Weglaten = het lesmoment dat bij die weekdag hoort.'),
      },
    },
    async (args) => {
      try {
        const date = resolveDate(args?.date);
        const week = scheduleWeekFor(date);
        const wd = weekdayIndex(date);
        const all = await store.getSchemasForUser(me.userId, me.role);
        const classes = all.filter(isGroupClass);
        if (!classes.length) return text({ message: 'Er zijn geen groepslessen gevonden.' });

        const thisWeek = classes.filter((s) => s.scheduleWeek === week);
        const q = norm(args?.series);
        const match = (s) =>
          q ? norm(s.series).includes(q) || norm(s.name).includes(q) : s.seriesOrder === wd || norm(s.series).includes(WEEKDAYS[wd]);
        const hits = thisWeek.filter(match);

        if (!hits.length) {
          const series = [...new Set(classes.map((s) => s.series).filter(Boolean))];
          return text({
            message: `Geen groepsles gevonden voor ${WEEKDAYS[wd]} ${date} (schemaweek ${week}).`,
            date,
            weekday: WEEKDAYS[wd],
            scheduleWeek: week,
            availableSeries: series,
            seriesThisWeek: thisWeek.map((s) => s.series ?? s.name),
          });
        }

        return text({
          date,
          weekday: WEEKDAYS[wd],
          scheduleWeek: week,
          classes: hits.map((s) => ({
            schemaId: s.id,
            name: s.name,
            series: s.series,
            exercises: (s.days[0]?.exercises ?? []).map((e) => ({
              name: e.exerciseName,
              targetSets: e.setsTarget,
              targetReps: e.repsTarget,
              targetWeightKg: e.targetWeight ?? null,
              notes: e.notes || null,
            })),
          })),
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : 'Groepsles opzoeken mislukt.');
      }
    }
  );

  if (isStaff) {
    server.registerTool(
      'list_athletes',
      {
        title: 'Mijn sporters',
        description: 'Lijst van sporters (naam, e-mail) die deze trainer begeleidt. Beheerders zien iedereen.',
        inputSchema: {},
      },
      async () => {
        const all = await store.getAllProfiles();
        const list = all.filter((p) => p.role === 'sporter' && (me.role === 'admin' || p.trainerId === me.userId));
        return text({ count: list.length, athletes: list.map((p) => ({ name: displayName(p), email: p.email })) });
      }
    );
  }

  return server;
}
