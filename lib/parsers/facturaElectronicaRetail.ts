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

export const facturaElectronicaRetailParser: PdfParser = {
  id: 'factura_retail',
  label: 'Factura Electrónica (SII retail / e-commerce)',
  detectScore: (text) => {
    let s = 0;
    if (/FACTURA\s+ELECTR[ÓO]NICA/i.test(text)) s += 0.6;
    if (/TOTAL\s+NETO/i.test(text)) s += 0.2;
    if (/I\.?V\.?A/i.test(text)) s += 0.1;
    if (/TOTAL\s*\$/i.test(text)) s += 0.1;
    return s;
  },
  parse: (text: string): CampoBoleta => {
    const T = clean(text);
    const lines = T.split('\n').map(l => l.trim()).filter(Boolean);

    // --- Emisor ---
    let rutEmisor: string | undefined;
    let nombreEmisor: string | undefined;

    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/R\.?U\.?T\.?:?\s*(\d{1,3}\.\d{3}\.\d{3}-[0-9Kk])/);
      if (m) {
        rutEmisor = normalizeRut(m[1]);

        // Buscar nombre cercano al RUT (3 líneas antes o después)
        for (let j = i - 3; j <= i + 3; j++) {
          const l = lines[j] || '';
          // Detecta nombres comunes de empresa chilena
          if (/SpA|LTDA|LIMITADA|SOCIEDAD|EMPRESA|COMERCIAL|CONSULTORA|INGENIER[IÍ]A|INVERSIONES/i.test(l)) {
            nombreEmisor = l.trim();
            break;
          }
          // Fallback: línea anterior en mayúsculas
          if (!nombreEmisor && j === i - 1 && /^[A-ZÁÉÍÓÚÑ\s\&\.]+$/.test(l.toUpperCase()) && l.length > 3) {
            nombreEmisor = l.trim();
          }
          // O línea siguiente si viene después del RUT
          if (!nombreEmisor && j === i + 1 && /^[A-ZÁÉÍÓÚÑ\s\&\.]+$/.test(l.toUpperCase()) && l.length > 3) {
            nombreEmisor = l.trim();
          }
        }
        break;
      }
    }

    // --- Receptor ---
    const receptorIdx = lines.findIndex(l => /^RECEPTOR/i.test(l));
    let nombreReceptor: string | undefined;
    let rutReceptor: string | undefined;

    if (receptorIdx >= 0) {
      for (let i = receptorIdx; i < receptorIdx + 8; i++) {
        const l = lines[i] || '';
        if (/Raz[oó]n\s+Social:/i.test(l)) {
          nombreReceptor = l.replace(/.*Raz[oó]n\s+Social:\s*/i, '').trim() || lines[i + 1];
        }
        const m = l.match(/RUT:\s*([0-9.]+[\-\s]?[0-9Kk])/i);
        if (m) {
          rutReceptor = normalizeRut(m[1]);
        }
      }
    }

    // --- Fecha ---
    const fecha =
      lines.find(l => /Fecha\s+de\s+Emisi[oó]n/i.test(l))
        ?.match(/(\d{1,2}[-/]\d{1,2}[-/]\d{4})/)
        ?.at(1);

    // --- Montos ---
    let neto: number | null = null;
    let iva: number | null = null;
    let total: number | null = null;

    for (const l of lines) {
      // Monto Neto
      if (/TOTAL\s+NETO/i.test(l)) {
        const m = l.match(/([\d\.\,]+)/);
        if (m) neto = normalizeMoneyToNumber(m[1]);
      }
      // IVA o 19%
      else if (/\bI\.?V\.?A\b/i.test(l) || /19%/i.test(l)) {
        const m = l.match(/([\d\.\,]+)/);
        if (m) iva = normalizeMoneyToNumber(m[1]);
      }
      // TOTAL (que no sea NETO)
      else if (/TOTAL(?!\s*NETO)/i.test(l)) {
        const m = l.match(/([\d\.\,]+)/);
        if (m) total = normalizeMoneyToNumber(m[1]);
      }
    }

    // --- Descripción / nota ---
    const idxDesc = lines.findIndex(l => /Notas\s+solicitadas|Proyecto|Pedido|Compra/i.test(l));
    const descripcion =
      idxDesc >= 0
        ? lines[idxDesc].replace(/^Notas\s+solicitadas\s+por\s+cliente:\s*/i, '').trim()
        : null;

    return {
      rutEmisor,
      nombreEmisor,
      rutReceptor,
      nombreReceptor,
      fecha,
      total,
      neto,
      retencion: iva,
      descripcion
    };
  },
};
