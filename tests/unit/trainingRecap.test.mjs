import { describe, it, expect } from 'vitest';
import { buildFacts, parseRecapReply, requestRecap } from '../../api/_lib/trainingRecap.mjs';

describe('buildFacts', () => {
  const base = {
    sporterName: 'Tanja',
    dayLabel: 'Dinsdag - Upper Kracht',
    feeling: 4,
    exercises: [{ name: 'Kettlebell Deadlift', weight: 16, sets: 3, reps: 12, effort: 'good', note: 'Linker heup iets hoger' }],
  };

  it('zet de sporter, de dag en de oefening in de tekst', () => {
    const facts = buildFacts(base);
    expect(facts).toContain('Sporter: Tanja');
    expect(facts).toContain('Training: Dinsdag - Upper Kracht');
    expect(facts).toContain('- Kettlebell Deadlift — 16 kg, 3 × 12, ging goed, notitie: Linker heup iets hoger');
  });

  it('vertaalt het gevoel naar woorden', () => {
    expect(buildFacts(base)).toContain('4 van 5 (goed)');
    expect(buildFacts({ ...base, feeling: 1 })).toContain('1 van 5 (zwaar)');
  });

  it('noemt het vorige gewicht alleen als het anders was', () => {
    const omhoog = buildFacts({ ...base, exercises: [{ ...base.exercises[0], previousWeight: 12 }] });
    expect(omhoog).toContain('vorige keer 12 kg');
    const gelijk = buildFacts({ ...base, exercises: [{ ...base.exercises[0], previousWeight: 16 }] });
    expect(gelijk).not.toContain('vorige keer');
  });

  it('laat weg wat niet is ingevuld', () => {
    const facts = buildFacts({ sporterName: 'Tanja', dayLabel: 'Full Body', exercises: [{ name: 'Plank' }] });
    expect(facts).not.toContain('Hoe het voelde');
    expect(facts).not.toContain('Opmerking van de sporter');
    expect(facts).toContain('- Plank');
  });

  it('slaat oefeningen zonder naam over', () => {
    expect(buildFacts({ ...base, exercises: [{ name: '  ', weight: 20 }] })).not.toContain('20 kg');
  });

  it('gaat om met onzin-invoer zonder te klappen', () => {
    expect(() => buildFacts({})).not.toThrow();
    expect(() => buildFacts({ exercises: 'nee' })).not.toThrow();
    expect(buildFacts({}).startsWith('Sporter: de sporter')).toBe(true);
  });

  it('kapt een absurd lange lijst af', () => {
    const veel = Array.from({ length: 80 }, (_, i) => ({ name: `Oefening ${i}` }));
    const regels = buildFacts({ ...base, exercises: veel }).split('\n').filter((l) => l.startsWith('- '));
    expect(regels).toHaveLength(30);
  });
});

describe('parseRecapReply', () => {
  const ok = '{"handover":"Met Tanja ging het goed.","toSporter":"Sterke eerste training!"}';

  it('leest gewone JSON', () => {
    expect(parseRecapReply(ok)).toEqual({ handover: 'Met Tanja ging het goed.', toSporter: 'Sterke eerste training!' });
  });

  it('leest JSON uit een codeblok met tekst eromheen', () => {
    expect(parseRecapReply('Hier is het:\n```json\n' + ok + '\n```\n')?.handover).toBe('Met Tanja ging het goed.');
  });

  it('accepteert een antwoord met maar één van de twee', () => {
    expect(parseRecapReply('{"handover":"Alleen intern."}')).toEqual({ handover: 'Alleen intern.', toSporter: '' });
  });

  it('geeft null bij onbruikbare antwoorden', () => {
    expect(parseRecapReply('sorry, dat kan ik niet')).toBeNull();
    expect(parseRecapReply('{"handover":"  ","toSporter":""}')).toBeNull();
    expect(parseRecapReply('')).toBeNull();
    expect(parseRecapReply(null)).toBeNull();
  });

  it('kapt absurd lange teksten af', () => {
    const lang = JSON.stringify({ handover: 'a'.repeat(5000), toSporter: 'b'.repeat(5000) });
    const out = parseRecapReply(lang);
    expect(out.handover).toHaveLength(2000);
    expect(out.toSporter).toHaveLength(1000);
  });
});

describe('requestRecap', () => {
  const training = {
    sporterName: 'Tanja',
    dayLabel: 'Kickboxing – Dinsdag',
    exercises: [{ name: 'Kettlebell Deadlift', weight: 16, sets: 3, reps: 12 }],
  };
  const antwoord = (obj) => ({ ok: true, json: async () => ({ output_text: JSON.stringify(obj) }) });

  it('stuurt de feiten naar het model en geeft de twee teksten terug', async () => {
    let verstuurd = null;
    const nep = async (_url, init) => {
      verstuurd = JSON.parse(init.body);
      return antwoord({ handover: 'Ging goed met Tanja.', toSporter: 'Sterke training!' });
    };
    const uit = await requestRecap(training, nep);
    expect(uit).toEqual({ handover: 'Ging goed met Tanja.', toSporter: 'Sterke training!' });
    expect(verstuurd.input[1].content[0].text).toContain('- Kettlebell Deadlift — 16 kg, 3 × 12');
  });

  it('roept het model niet aan als er niets gelogd is', async () => {
    let aangeroepen = false;
    const nep = async () => { aangeroepen = true; return antwoord({}); };
    await expect(requestRecap({ sporterName: 'Tanja', exercises: [] }, nep)).rejects.toThrow(/niets gelogd/);
    expect(aangeroepen).toBe(false);
  });

  it('geeft een leesbare fout als de AI-dienst faalt', async () => {
    const nep = async () => ({ ok: false, status: 500, text: async () => 'boem' });
    await expect(requestRecap(training, nep)).rejects.toThrow(/AI-dienst gaf een fout/);
  });

  it('geeft een leesbare fout bij een onbruikbaar antwoord', async () => {
    const nep = async () => ({ ok: true, json: async () => ({ output_text: 'sorry' }) });
    await expect(requestRecap(training, nep)).rejects.toThrow(/geen bruikbare tekst/);
  });
});
