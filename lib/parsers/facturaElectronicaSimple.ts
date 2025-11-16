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

export const facturaElectronicaSimpleParser: PdfParser = {
  id: 'factura_simple',
  label: 'Factura Electrónica (SII simple)',
  detectScore(text) {
    let s = 0;

    // Una factura simple suele tener "del" en la fecha (muy característico)
    if (/Fecha\s+Emision:\s*\d{1,2}\s+de\s+\w+\s+del\s+\d{4}/i.test(text)) {
      s += 0.5;
    }
    // La simple casi siempre incluye Administración u Honorarios
    if (/Administraci[oó]n|Honorarios/i.test(text)) {
      s += 0.4;
    }
    // Factura simple NO tiene I.V.A detallado ni Total Neto
    if (/MONTO\s+NETO/i.test(text)) {
      s -= 0.5;
    }
    if (/I\.?V\.?A/i.test(text)) {
      s -= 0.5;
    }
    return s;
  },

  parse: (text: string): CampoBoleta => {
    const T = clean(text);
    const lines = T.split('\n').map(l => l.trim()).filter(Boolean);

    // --- Emisor ---
    const rutEmisorLine = lines.find(l => /R\.?U\.?T\.?:\s*\d{1,3}\.\d{3}\.\d{3}-[0-9Kk]/.test(l));
    const rutEmisor = rutEmisorLine ? normalizeRut(rutEmisorLine.replace(/^.*R\.?U\.?T\.?:/, '')) : undefined;

    // Buscar nombre emisor en primeras líneas
    const nombreEmisor =
      lines.find(l => /SPA|LTDA|LIMITADA|SOCIEDAD|CONSULTOR[IÍ]A|INGENIER[IÍ]A/i.test(l)) ||
      lines[0];

    // --- Receptor ---
    const receptorIdx = lines.findIndex(l => /^SEÑOR\(ES\)/i.test(l));
    let nombreReceptor: string | undefined;
    let rutReceptor: string | undefined;

    if (receptorIdx >= 0) {
      nombreReceptor = lines[receptorIdx].replace(/^SEÑOR\(ES\):?\s*/i, '').trim() || lines[receptorIdx + 1];
      for (let i = receptorIdx; i < receptorIdx + 5; i++) {
        const m = lines[i]?.match(/R\.?U\.?T\.?:\s*([0-9.]+[\-\s]?[0-9Kk])/i);
        if (m) {
          rutReceptor = normalizeRut(m[1]);
          break;
        }
      }
    }

    // --- Fecha de emisión ---
    const fecha =
      lines.find(l => /Fecha\s+Emisi[oó]n/i.test(l))?.match(/(\d{1,2}\s+de\s+\w+\s+del\s+\d{4})/i)?.[1] || undefined;

    // --- Descripción ---
    const idxDesc = lines.findIndex(l => /Servicio|Producto|Administraci[oó]n|Honorarios/i.test(l));
    let descripcion: string | null = null;
    if (idxDesc >= 0) {
      descripcion = lines[idxDesc].trim();
    }

    // --- Montos ---
    let neto: number | null = null;
    let iva: number | null = null;
    let total: number | null = null;

    for (const l of lines) {
      if (/MONTO\s+NETO/i.test(l)) {
        const m = l.match(/([\d\.\,]+)/);
        if (m) neto = normalizeMoneyToNumber(m[1]);
      }
      if (/I\.V\.A/i.test(l)) {
        const m = l.match(/([\d\.\,]+)/);
        if (m) iva = normalizeMoneyToNumber(m[1]);
      }
      if (/TOTAL/i.test(l)) {
        const m = l.match(/([\d\.\,]+)/);
        if (m) total = normalizeMoneyToNumber(m[1]);
      }
    }

    return {
      rutEmisor,
      nombreEmisor,
      rutReceptor,
      nombreReceptor,
      fecha,
      total,
      neto,
      retencion: iva, // por consistencia
      descripcion
    };
  },
};
