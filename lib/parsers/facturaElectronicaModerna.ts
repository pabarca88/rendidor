import { PdfParser, CampoBoleta } from './types';
import { normalizeMoneyToNumber } from '../number';

// Helpers
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

export const facturaElectronicaModernaParser: PdfParser = {
  id: 'factura_electronica_moderna',
  label: 'Factura Electrónica (SII moderna)',
  detectScore: (text) => {
    let s = 0;
    if (/FACTURA ELECTR[ÓO]NICA/i.test(text)) s += 0.6;
    if (/INFORMACI[ÓO]N DEL RECEPTOR/i.test(text)) s += 0.3;
    if (/RESUMEN DEL DOCUMENTO/i.test(text)) s += 0.1;
    return s;
  },
  parse: (text: string): CampoBoleta => {
    const T = clean(text);
    const lines = T.split('\n').map(l => l.trim()).filter(Boolean);

    // --- Emisor ---
    let nombreEmisor = lines.find(l => /SPA|LTDA|LIMITADA|SOCIEDAD|EMPRESARIALES/i.test(l));
    const rutEmisorLine = lines.find(l => /R\.?U\.?T\.?:/i.test(l));
    const rutEmisor = rutEmisorLine ? normalizeRut(rutEmisorLine.replace(/.*R\.?U\.?T\.?:/i, '')) : undefined;

    // --- Receptor (sección “INFORMACIÓN DEL RECEPTOR”) ---
    const idxInfoRec = lines.findIndex(l => /INFORMACI[ÓO]N DEL RECEPTOR/i.test(l));
    let nombreReceptor: string | undefined;
    let rutReceptor: string | undefined;
    if (idxInfoRec >= 0) {
      for (let i = idxInfoRec; i < idxInfoRec + 12; i++) {
        const l = lines[i] || '';
        if (/^Señor/i.test(l)) nombreReceptor = l.replace(/^Señor\(es\)\s*/i, '');
        if (/^RUT/i.test(l)) rutReceptor = normalizeRut(l.replace(/^RUT\s*/i, ''));
      }
    }

    // --- Fecha de emisión ---
    const fecha =
      lines.find(l => /Fecha\s+de\s+Emisi[oó]n/i.test(l))?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ||
      undefined;

    // --- Descripción ---
    // Buscar después de “Descripción:” o “Detalle del documento”
    let descripcion: string | null = null;
    const idxDesc = lines.findIndex(l => /^Descripci[oó]n:/i.test(l));
    if (idxDesc >= 0 && lines[idxDesc + 1]) {
      descripcion = lines[idxDesc + 1];
    } else {
      const idxDetalle = lines.findIndex(l => /DETALLE DEL DOCUMENTO/i.test(l));
      if (idxDetalle >= 0) {
        descripcion = lines.slice(idxDetalle + 1, idxDetalle + 4).join(' ');
      }
    }

    // --- Montos ---
    const resumenIdx = lines.findIndex(l => /RESUMEN DEL DOCUMENTO/i.test(l));
    let montoNeto: number | null = null;
    let iva: number | null = null;
    let total: number | null = null;

    if (resumenIdx >= 0) {
      for (let i = resumenIdx; i < lines.length; i++) {
        const l = lines[i];
        if (/Monto\s*Neto/i.test(l)) {
          const next = lines[i + 1] || '';
          montoNeto = normalizeMoneyToNumber(l) || normalizeMoneyToNumber(next);
        }
        if (/I\.?V\.?A/i.test(l)) {
          const next = lines[i + 1] || '';
          iva = normalizeMoneyToNumber(l) || normalizeMoneyToNumber(next);
        }
        if (/Total/i.test(l)) {
          const next = lines[i + 1] || '';
          total = normalizeMoneyToNumber(l) || normalizeMoneyToNumber(next);
        }
      }
    }

    return {
      rutEmisor,
      nombreEmisor,
      rutReceptor,
      nombreReceptor,
      fecha,
      total,
      neto: montoNeto,
      retencion: iva,
      descripcion,
    };
  },
};
