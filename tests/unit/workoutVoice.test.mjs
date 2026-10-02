import { describe, expect, it } from 'vitest';
import { audioKind, buildVoiceSystem, MAX_AUDIO_CHARS, transcribeAudio } from '../../api/_lib/workoutVoice.mjs';
import { normalizePhotoWorkout } from '../../api/_lib/workoutPhoto.mjs';

describe('workout inspreken', () => {
  it('neemt alleen opnames aan (webm uit Chrome, mp4 uit Safari)', () => {
    expect(audioKind('data:audio/webm;codecs=opus;base64,AAAA')).toBe('webm');
    expect(audioKind('data:audio/mp4;base64,AAAA')).toBe('mp4');
    expect(audioKind('data:audio/ogg;codecs=opus;base64,AAAA')).toBe('ogg');
    expect(audioKind('data:image/png;base64,AAAA')).toBeNull();
    expect(audioKind('niets')).toBeNull();
    expect(MAX_AUDIO_CHARS).toBeLessThan(4.5 * 1024 * 1024);
  });

  it('stuurt de opname als bestand naar de transcriptie, in het Nederlands', async () => {
    let sent;
    const fetchImpl = async (url, init) => {
      sent = { url, init };
      return { ok: true, json: async () => ({ text: ' Goblet squat drie keer tien, twaalf kilo. ' }) };
    };
    const text = await transcribeAudio('data:audio/webm;codecs=opus;base64,' + Buffer.from('abc').toString('base64'), { apiKey: 'k', model: 'm', fetchImpl });
    expect(text).toBe('Goblet squat drie keer tien, twaalf kilo.');
    expect(sent.url).toMatch(/audio\/transcriptions$/);
    expect(sent.init.body.get('language')).toBe('nl');
    expect(sent.init.body.get('model')).toBe('m');
    expect(sent.init.body.get('file').name).toBe('opname.webm');
  });

  it('een fout van de transcriptie komt door, zonder opname die niet klopt te versturen', async () => {
    const fetchImpl = async () => ({ ok: false, status: 400, text: async () => 'slecht' });
    await expect(transcribeAudio('data:audio/mp4;base64,AAAA', { apiKey: 'k', model: 'm', fetchImpl })).rejects.toThrow(/OpenAI HTTP 400/);
    await expect(transcribeAudio('data:image/png;base64,AAAA', { apiKey: 'k', model: 'm', fetchImpl })).rejects.toThrow(/Geen geldige opname/);
  });

  it('de instructie neemt alleen over wat gezegd is, en het laatste bij een verbetering', () => {
    const sys = buildVoiceSystem('\nCATALOGUS');
    expect(sys).toMatch(/verzin\s+geen oefeningen/);
    expect(sys).toMatch(/verbetering geldt het laatste/);
    expect(sys.endsWith('CATALOGUS')).toBe(true);
  });

  it('zonder naam heet de workout "Ingesproken workout"', () => {
    const r = normalizePhotoWorkout({ days: [{ exercises: [{ nameOnPhoto: 'Plank' }] }] }, () => null, 'Ingesproken workout');
    expect(r.name).toBe('Ingesproken workout');
    expect(r.days[0].exercises[0].exerciseName).toBe('Plank');
  });
});
