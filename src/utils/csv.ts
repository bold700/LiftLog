/**
 * Kleine, afhankelijkheidsvrije CSV-parser voor import-sjablonen (bijv. leden importeren in Beheer).
 * Herkent zowel komma als puntkomma als scheidingsteken (Excel exporteert in het Nederlands vaak met
 * puntkomma) en ondersteunt aanhalingstekens rond een veld met het scheidingsteken erin. Gaat ervan
 * uit dat een veld geen regeleinde bevat — genoeg voor de korte, enkelvoudige waarden (naam,
 * e-mailadres, getal) die deze sjablonen gebruiken.
 */
export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

function detectDelimiter(headerLine: string): ',' | ';' {
  const commas = (headerLine.match(/,/g) || []).length;
  const semicolons = (headerLine.match(/;/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

function splitLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

export function parseCsv(text: string): ParsedCsv {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitLine(lines[0], delimiter).map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const values = splitLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? '').trim();
    });
    return row;
  });
  return { headers, rows };
}

/** Bouwt een CSV-tekst (met puntkomma, voor Excel-NL) uit een header en rijen. */
export function toCsv(headers: string[], rows: string[][]): string {
  const escape = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [headers, ...rows].map((r) => r.map(escape).join(';')).join('\r\n') + '\r\n';
}
