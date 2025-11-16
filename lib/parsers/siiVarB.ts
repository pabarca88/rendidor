import { PdfParser, CampoBoleta } from './types';
import { normalizeMoneyToNumber } from '../number';

// Ejemplo: boleta que usa “Monto Total a Pagar” y “Receptor:” en líneas separadas
export const siiVarBParser: PdfParser = {
  id: 'sii_var_b',
  label: 'SII variante B',
  detectScore: (text) => {
    let s = 0;
    if (/BOLETA/i.test(text)) s += 0.3;
    if (/Monto Total a Pagar/i.test(text)) s += 0.4;
    if (/Receptor:/i.test(text)) s += 0.3;
    return s;
  },
  parse: (text) => {
    const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);

    const nombreEmisor = lines.find(l => /^Emisor:/i.test(l))?.replace(/^Emisor:\s*/i, '');
    const rutEmisor = lines.find(l => /^RUT Emisor:/i.test(l))?.replace(/^RUT Emisor:\s*/i, '');

    const nombreReceptor = lines.find(l => /^Receptor:/i.test(l))?.replace(/^Receptor:\s*/i, '');
    const rutReceptor = lines.find(l => /^RUT Receptor:/i.test(l))?.replace(/^RUT Receptor:\s*/i, '');

    const fecha = lines.find(l => /^Fecha Emisi[oó]n:/i.test(l))?.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1];

    let total: number | null = null;
    const idx = lines.findIndex(l => /Monto Total a Pagar/i.test(l));
    if (idx >= 0) {
      const same = lines[idx].match(/([\d\.\,]+(?:,-)?)/)?.[1];
      total = same ? normalizeMoneyToNumber(same) : normalizeMoneyToNumber(lines[idx + 1] || '');
    }

    return {
      rutEmisor,
      nombreEmisor,
      rutReceptor,
      nombreReceptor,
      fecha,
      total,
      neto: null,
      retencion: null,
      descripcion: null
    } as CampoBoleta;
  }
};
