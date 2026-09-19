import { describe, expect, it } from 'vitest';
import { whatsappUrl } from '../../src/utils/share';

describe('whatsappUrl', () => {
  it('zet de tekst in de link zonder nummer, zodat de gebruiker de ontvanger kiest', () => {
    const url = whatsappUrl('Hoi Tanja!');
    expect(url).toBe('https://wa.me/?text=Hoi%20Tanja!');
    expect(url).not.toContain('phone=');
  });

  it('codeert regeleindes en leestekens die een link anders zouden breken', () => {
    const url = whatsappUrl('Overdracht:\n\n- heupen & techniek\n- 25 kg × 10');
    expect(url).toContain('%0A%0A');
    expect(url).toContain('%26');
    expect(decodeURIComponent(url.split('text=')[1])).toContain('25 kg × 10');
  });

  it('knipt witruimte aan de randen weg', () => {
    expect(whatsappUrl('  hoi  ')).toBe('https://wa.me/?text=hoi');
  });

  it('kort een te lange tekst in in plaats van een onbruikbare link te maken', () => {
    const url = whatsappUrl('a'.repeat(5000));
    const body = decodeURIComponent(url.split('text=')[1]);
    expect(body.length).toBeLessThanOrEqual(1800);
    expect(body.endsWith('…')).toBe(true);
  });
});
