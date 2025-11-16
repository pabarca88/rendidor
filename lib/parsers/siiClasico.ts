import { PdfParser, CampoBoleta } from './types';
import { normalizeMoneyToNumber } from '../number';

function normalizeRut(raw: string): string {
  return raw
    .replace(/\./g, '')
    .replace(/[−–—]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/^(\d+)\s+([Kk0-9])$/, '$1-$2')
    .toUpperCase()
    .trim();
}

function sanitizeText(t: string): string {
  return t
    .replace(/\r/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ ]+\n/g, '\n')
    .trim();
}

function extractBoletaSiiClasico(text: string): CampoBoleta {
  const T = sanitizeText(text);
  const lines = T.split('\n').map(l => l.trim()).filter(Boolean);

  let nombreEmisor: string | undefined;
  let idxBoleta = lines.findIndex(l => /BOLETA DE HONORARIOS/i.test(l));
  if (idxBoleta > 0) nombreEmisor = lines[idxBoleta - 1];

  const rutEmisorMatch = lines.find(l => /^RUT:/i.test(l))?.match(/RUT:\s*([0-9.]+[\-\s]?[0-9Kk])/i);
  const rutEmisor = rutEmisorMatch ? normalizeRut(rutEmisorMatch[1]) : undefined;

  const receptorLine = lines.find(l => /Señor\(es\):/i.test(l));
  let nombreReceptor: string | undefined;
  let rutReceptor: string | undefined;

  if (receptorLine) {
    const nameMatch = receptorLine.match(/Señor\(es\):\s*(.*?)\s*Rut:/i);
    if (nameMatch) nombreReceptor = nameMatch[1].trim();

    const rutMatch = receptorLine.match(/Rut:\s*([0-9.]+(?:\s*-\s*|\s*)[0-9Kk])/i);
    if (rutMatch) rutReceptor = normalizeRut(rutMatch[1]);
  }

  let fecha: string | undefined;
  const emisionLine = lines.find(l => /Fecha\s*\/\s*Hora\s*Emisi[oó]n/i.test(l));
  if (emisionLine) {
    const m = emisionLine.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (m) fecha = m[1];
  }

  if (!fecha) {
    const fechaLine = lines.find(l => /^Fecha:/i.test(l));
    if (fechaLine) fecha = fechaLine.replace(/^Fecha:\s*/i, '').trim();
  }

  let descripcion: string | null = null;
  const idxDesc = lines.findIndex(l => /Por atenci[oó]n profesional/i.test(l));
  if (idxDesc >= 0) {
    const next = lines[idxDesc + 1] || '';
    const descPart = next.replace(/\s*\d[\d\.\,]*\s*$/, '').trim();
    descripcion = descPart || null;
  }

  let total: number | null = null;
  const idxTotal = lines.findIndex(l => /Total\s+Honorarios/i.test(l));
  if (idxTotal >= 0) {
    const sameLine = lines[idxTotal].match(/Total\s+Honorarios.*?([\d\.\,]+(?:,-)?)/i)?.[1];
    if (sameLine) {
      total = normalizeMoneyToNumber(sameLine);
    } else {
      const maybeAmount = lines[idxTotal + 1] || '';
      const m = maybeAmount.match(/([\d\.\,]+(?:,-)?)/);
      if (m) total = normalizeMoneyToNumber(m[1]) ?? null;
    }
  }

  if (total == null) {
    const all = Array.from(T.matchAll(/([\d]{1,3}(\.[\d]{3})+|\d+)(,\d{1,2})?/g)).map(m => m[0]);
    if (all.length) total = normalizeMoneyToNumber(all[all.length - 1]);
  }

  // --- Número de documento (evitar tomar "Res. Ex. N° 83") ---
  let numeroDocumento: string | null = null;

  // 1) Intento más preciso: línea que contiene "BOLETA"
  const lineBoleta = lines.find(l => /BOLETA.*N/i.test(l));
  if (lineBoleta) {
    const m = lineBoleta.match(/N\s*[°º]?\s*(\d{1,7})/i);
    if (m) numeroDocumento = m[1];
  }

  // 2) Si aún no se encontró, buscar en todo el documento, pero evitando Res. Ex.
  if (!numeroDocumento) {
    const m = T.match(/(?<!Res\.?\s*Ex\.?.{0,10})N\s*[°º]?\s*(\d{1,7})/i);
    if (m) numeroDocumento = m[1];
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
    descripcion,
    numero: numeroDocumento, 
  };
}

export const siiClasicoParser: PdfParser = {
  id: 'sii_clasico',
  label: 'SII boleta clásica',
  detectScore: (text) => {
    let score = 0;
    if (/BOLETA DE HONORARIOS/i.test(text)) score += 0.5;
    if (/Fecha\s*\/\s*Hora\s*Emisi[oó]n/i.test(text)) score += 0.3;
    if (/Total\s+Honorarios/i.test(text)) score += 0.2;
    return score;
  },
  parse: extractBoletaSiiClasico,
};
