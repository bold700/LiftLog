import { describe, it, expect } from 'vitest';
import { sanitizeNumberInput } from '../../src/components/NumberField';

describe('sanitizeNumberInput (decimaal)', () => {
  const dec = (v: string) => sanitizeNumberInput(v, true);

  it('laat een komma staan — de enige decimaaltoets op een Nederlands iOS-keypad', () => {
    expect(dec('69,3')).toBe('69,3');
    expect(dec('69,')).toBe('69,');
  });

  it('laat een punt ook toe', () => {
    expect(dec('69.3')).toBe('69.3');
  });

  it('staat maar één decimaalteken toe', () => {
    expect(dec('69,3,5')).toBe('69,35');
    expect(dec('69.3.5')).toBe('69.35');
    expect(dec('69,3.5')).toBe('69,35');
  });

  it('weert letters en tekens', () => {
    expect(dec('69kg')).toBe('69');
    expect(dec('-69')).toBe('69');
    expect(dec('6 9')).toBe('69');
  });

  it('laat een leeg veld leeg', () => {
    expect(dec('')).toBe('');
  });
});

describe('sanitizeNumberInput (heel getal)', () => {
  const int = (v: string) => sanitizeNumberInput(v, false);

  it('weert elk decimaalteken', () => {
    expect(int('12,5')).toBe('125');
    expect(int('12.5')).toBe('125');
  });

  it('houdt cijfers over', () => {
    expect(int('12 reps')).toBe('12');
  });
});

describe('wat de app opslaat', () => {
  it('is met een komma getypt en met een punt te rekenen', () => {
    const typed = sanitizeNumberInput('69,3', true);
    expect(Number(typed.replace(',', '.'))).toBe(69.3);
  });
});
