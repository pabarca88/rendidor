import { PdfParser, CampoBoleta } from './types';
import { normalizeMoneyToNumber } from '../number';

function clean(t: string): string {
  return t
    .replace(/\r/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ ]+\n/g, '\n')
    .trim();
}

function normalizeRut(raw: string): string {
  return raw
    .replace(/\./g, '')
    .replace(/[−–—]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/^(\d+)\s+([Kk0-9])$/, '$1-$2')
    .toUpperCase()
    .trim();
}

export const notaCreditoElectronicaParser: PdfParser = {
  id: 'nota_credito',
  label: 'Nota de Crédito Electrónica (SII)',
  detectScore: (text) => {
    let s = 0;
    if (/NOTA\s+DE\s+CR[EÉ]DITO/i.test(text)) s += 0.7;
    if (/S\.I\.I\./i.test(text)) s += 0.1;
    if (/TOTAL/i.test(text)) s += 0.1;
    if (/Anula Documento/i.test(text)) s += 0.1;
    return s;
  },
  parse: (text: string): CampoBoleta => {
    const T = clean(text);
    const lines = T.split('\n').map(l => l.trim()).filter(Boolean);

    // --- Emisor ---
    const rutEmisor = lines.find(l => /R\.?U\.?T\s*:/.test(l))
      ?.match(/(\d{1,3}\.\d{3}\.\d{3}-[0-9Kk])/)
      ?.at(1);
    const nombreEmisor =
      lines.find(l => /PROGARANTIA|SPA|LTDA|SOCIEDAD|ADMINISTRADORA|EMPRESA/i.test(l)) ||
      lines[0];

    // --- Receptor ---
    const receptorIdx = lines.findIndex(l => /^Señor/i.test(l));
    let nombreReceptor: string | undefined;
    let rutReceptor: string | undefined;
    if (receptorIdx >= 0) {
      nombreReceptor = lines[receptorIdx].replace(/^Señor\(es\)\s*/i, '').trim() || lines[receptorIdx + 1];
      for (let i = receptorIdx; i < receptorIdx + 5; i++) {
        const m = lines[i]?.match(/RUT\s*:?(\s*[0-9.]+[\-\s]?[0-9Kk])/i);
        if (m) {
          rutReceptor = normalizeRut(m[1]);
          break;
        }
      }
    }

    // --- Fecha ---
    const fecha =
      lines.find(l => /Fecha\s+Documento/i.test(l))
        ?.match(/(\d{1,2}[-/]\d{1,2}[-/]\d{4})/)
        ?.at(1) || undefined;

    // --- Montos ---
    let neto: number | null = null;
    let exento: number | null = null;
    let total: number | null = null;

    for (const l of lines) {
      if (/Afecto/i.test(l)) {
        const m = l.match(/([\d\.\,]+)/);
        if (m) neto = normalizeMoneyToNumber(m[1]);
      }
      if (/Exento/i.test(l)) {
        const m = l.match(/([\d\.\,]+)/);
        if (m) exento = normalizeMoneyToNumber(m[1]);
      }
      if (/TOTAL/i.test(l)) {
        const m = l.match(/([\d\.\,]+)/);
        if (m) total = normalizeMoneyToNumber(m[1]);
      }
    }

    // --- Descripción / comentario ---
    const comentarioIdx = lines.findIndex(l => /Comentario/i.test(l));
    let descripcion: string | null = null;
    if (comentarioIdx >= 0) {
      descripcion = lines.slice(comentarioIdx + 1, comentarioIdx + 4).join(' ');
    }

    return {
      rutEmisor: rutEmisor ? normalizeRut(rutEmisor) : undefined,
      nombreEmisor,
      rutReceptor,
      nombreReceptor,
      fecha,
      total,
      neto: exento, // para mantener compatibilidad
      retencion: null,
      descripcion
    };
  },
};
