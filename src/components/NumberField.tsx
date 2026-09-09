/**
 * Getalveld dat op elke telefoon werkt.
 *
 * `<input type="number">` weigert een komma. Op een Nederlandse iOS-keypad is de komma de enige
 * decimaaltoets, dus "69,3" werd daar stil weggegooid en hield de gebruiker een leeg veld over.
 * Dit veld is daarom een tekstveld met een numeriek toetsenbord: het toont wat je typt (komma
 * blijft komma) en geeft aan de app altijd een punt door, zodat `Number(...)` gewoon werkt.
 */
import { useEffect, useState } from 'react';
import { TextField } from '@mui/material';
import type { TextFieldProps } from '@mui/material';

export type NumberFieldProps = Omit<TextFieldProps, 'onChange' | 'type' | 'value'> & {
  /** Waarde met een punt als decimaalteken (of leeg). */
  value: string;
  /** Krijgt de waarde met een punt, klaar voor `Number(...)`. */
  onChange: (value: string) => void;
  /** Sta decimalen toe. Zonder dit kun je alleen hele getallen typen (sets, reps, seconden). */
  decimal?: boolean;
};

/** Houdt alleen cijfers over, plus hooguit één decimaalteken. */
export function sanitizeNumberInput(raw: string, decimal: boolean): string {
  const cleaned = raw.replace(decimal ? /[^\d.,]/g : /\D/g, '');
  if (!decimal) return cleaned;
  const first = cleaned.search(/[.,]/);
  if (first === -1) return cleaned;
  // Alles na het eerste decimaalteken mag alleen nog uit cijfers bestaan.
  return cleaned.slice(0, first + 1) + cleaned.slice(first + 1).replace(/[.,]/g, '');
}

/** Wat de app opslaat: komma wordt punt. */
function toValue(text: string): string {
  return text.replace(',', '.');
}

export const NumberField = ({ value, onChange, decimal = false, ...rest }: NumberFieldProps) => {
  const [text, setText] = useState(value);

  // Waarde van buitenaf (formulier gewist, ander item gekozen) overnemen, maar niet terwijl je
  // "69," typt: dat is dezelfde waarde als wat de app al heeft.
  useEffect(() => {
    setText((current) => (toValue(current) === value ? current : value));
  }, [value]);

  return (
    <TextField
      {...rest}
      type="text"
      value={text}
      onChange={(e) => {
        const next = sanitizeNumberInput(e.target.value, decimal);
        setText(next);
        onChange(toValue(next));
      }}
      inputProps={{ inputMode: decimal ? 'decimal' : 'numeric', ...rest.inputProps }}
    />
  );
};
