const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

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
  const exerciseName = typeof exercise?.exerciseName === 'string' ? exercise.exerciseName.trim() : '';
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json(res, 500, { error: 'OPENAI_API_KEY ontbreekt op de server.' });
  }

  const prompt = cleanText(req.body?.prompt);
  if (!prompt) {
    return json(res, 400, { error: 'Prompt is verplicht.' });
  }

  const systemInstruction =
    'Je bent een strength coach. Geef ALLEEN geldige JSON terug, zonder markdown. ' +
    'Output schema: {"name":"string","days":[{"dayLabel":"string","exercises":[{"exerciseName":"string","setsTarget":number,"repsTarget":number,"restSeconds":number,"notes":"string"}]}]}. ' +
    'Maak 1-7 dagen. Elke dag 1-12 oefeningen. Geen extra velden.';

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        max_output_tokens: 1400,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: systemInstruction }] },
          { role: 'user', content: [{ type: 'input_text', text: prompt }] },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return json(res, 502, {
        error: 'OpenAI API gaf een fout terug.',
        details: text.slice(0, 600),
      });
    }

    const payload = await response.json();
    const raw = extractText(payload);
    if (!raw) {
      return json(res, 502, { error: 'Lege AI-respons ontvangen.' });
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
      } else {
        throw new Error('Geen geldige JSON in AI-respons');
      }
    }

    const name =
      typeof parsed?.name === 'string' && parsed.name.trim()
        ? parsed.name.trim().slice(0, 120)
        : 'AI Workout';
    const daysRaw = Array.isArray(parsed?.days) ? parsed.days : [];
    const days = daysRaw.map(normalizeDay).filter(Boolean).slice(0, 7);

    if (!days.length) {
      return json(res, 422, { error: 'AI kon geen bruikbare workout genereren.' });
    }

    return json(res, 200, { name, days });
  } catch (error) {
    return json(res, 500, {
      error: 'Onverwachte serverfout bij workoutgeneratie.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
