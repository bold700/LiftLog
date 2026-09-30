import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseXlsx } from '../../src/utils/xlsx';

/** Een kleine werkmap zoals Excel/Virtuagym die schrijft. */
function workbook(sheetXml: string, opts: { shared?: string[]; styles?: string; sheetName?: string } = {}): Uint8Array {
  const sheetName = opts.sheetName ?? 'sheet1.xml';
  const files: Record<string, Uint8Array> = {
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Leden" sheetId="1" r:id="rId1"/></sheets></workbook>'
    ),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/${sheetName}"/></Relationships>`),
    [`xl/worksheets/${sheetName}`]: strToU8(`<?xml version="1.0"?><worksheet><sheetData>${sheetXml}</sheetData></worksheet>`),
  };
  if (opts.shared) files['xl/sharedStrings.xml'] = strToU8(`<sst>${opts.shared.map((t) => `<si><t>${t}</t></si>`).join('')}</sst>`);
  if (opts.styles) files['xl/styles.xml'] = strToU8(opts.styles);
  return zipSync(files);
}

describe('parseXlsx', () => {
  it('leest gedeelde teksten, getallen en lege cellen op de juiste kolom', () => {
    const data = workbook(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>' +
        '<row r="2"><c r="A2"><v>41243961</v></c><c r="C2" t="s"><v>4</v></c><c r="D2"><v>612345678</v></c></row>',
      { shared: ['member_id', 'Firstname', 'email', 'Small Group Training', 'jan@x.nl'] }
    );
    const parsed = parseXlsx(data);
    expect(parsed.headers).toEqual(['member_id', 'firstname', 'email', 'small group training']);
    expect(parsed.rows).toEqual([{ member_id: '41243961', firstname: '', email: 'jan@x.nl', 'small group training': '612345678' }]);
  });

  it('leest inline tekst, opgemaakte stukjes en XML-tekens', () => {
    const data = workbook(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>naam</t></is></c></row>' +
        '<row r="2"><c r="A2" t="inlineStr"><is><r><t>Jan </t></r><r><t xml:space="preserve">&amp; Els</t></r></is></c></row>'
    );
    expect(parseXlsx(data).rows).toEqual([{ naam: 'Jan & Els' }]);
  });

  it('zet een datumcel (Excel-getal met datumnotatie) om naar JJJJ-MM-DD', () => {
    const styles =
      '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>' +
      '<cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs></styleSheet>';
    const data = workbook(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>geboortedatum</t></is></c><c r="B1" t="inlineStr"><is><t>lid sinds</t></is></c><c r="C1" t="inlineStr"><is><t>credits</t></is></c></row>' +
        '<row r="2"><c r="A2" s="1"><v>32874</v></c><c r="B2" s="2"><v>45352</v></c><c r="C2" s="0"><v>10</v></c></row>',
      { styles }
    );
    expect(parseXlsx(data).rows).toEqual([{ geboortedatum: '1990-01-01', 'lid sinds': '2024-03-01', credits: '10' }]);
  });

  it('volgt het eerste werkblad uit workbook.xml, ook als dat geen sheet1 heet', () => {
    const data = workbook('<row r="1"><c r="A1" t="inlineStr"><is><t>email</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>a@b.nl</t></is></c></row>', {
      sheetName: 'leden.xml',
    });
    expect(parseXlsx(data).rows).toEqual([{ email: 'a@b.nl' }]);
  });

  it('slaat lege rijen over en geeft niets terug voor een leeg werkblad', () => {
    expect(parseXlsx(workbook('<row r="1"/>'))).toEqual({ headers: [], rows: [] });
    const data = workbook('<row r="1"/><row r="2"><c r="A2" t="inlineStr"><is><t>email</t></is></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>x@y.nl</t></is></c></row>');
    expect(parseXlsx(data)).toEqual({ headers: ['email'], rows: [{ email: 'x@y.nl' }] });
  });
});
