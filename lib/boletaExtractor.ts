// lib/boletaExtractor.ts
import { normalizeMoneyToNumber } from './number';

export type BoletaFields = {
  rutEmisor?: string;
  nombreEmisor?: string;
  rutReceptor?: string;
  nombreReceptor?: string;
  fecha?: string;              // preferimos dd/mm/yyyy si viene
  total?: number | null;
  descripcion?: string | null; // extra útil
};

// Normaliza RUT: quita puntos, usa guión ASCII, compacta DV
export function normalizeRut(raw: string): string {
  return raw
    .replace(/\./g, '')
    .replace(/[−–—]/g, '-')      // guiones unicode -> ASCII
    .replace(/\s*-\s*/g, '-')    // colapsa espacios alrededor del guion
    .replace(/^(\d+)\s+([Kk0-9])$/, '$1-$2') // si viene sin guion pero con espacio antes del DV
    .toUpperCase()
    .trim();
}

// Sanitiza texto general: normaliza espacios y guiones
function sanitizeText(t: string): string {
  return t
    .replace(/\r/g, '')
    .replace(/[−–—]/g, '-')  // guiones unicode -> ASCII
    .replace(/\u00A0/g, ' ') // NBSP -> espacio
    .replace(/[ \t]+/g, ' ')
    .replace(/[ ]+\n/g, '\n')
    .trim();
}

export function extractBoleta(text: string): BoletaFields {
  const T = sanitizeText(text);
  const lines = T.split('\n').map(l => l.trim()).filter(Boolean);

  // --- Emisor: línea anterior a “BOLETA DE HONORARIOS” ---
  let nombreEmisor: string | undefined;
  let idxBoleta = lines.findIndex(l => /BOLETA DE HONORARIOS/i.test(l));
  if (idxBoleta > 0) {
    nombreEmisor = lines[idxBoleta - 1];
  }
  // RUT emisor: línea con “RUT: …”
  const rutEmisorMatch = lines.find(l => /^RUT:/i.test(l))?.match(/RUT:\s*([0-9.]+[\-\s]?[0-9Kk])/i);
  const rutEmisor = rutEmisorMatch ? normalizeRut(rutEmisorMatch[1]) : undefined;

  // --- Receptor: “Señor(es): … Rut: …” (mismo renglón) ---
    const receptorLine = lines.find(l => /Señor\(es\):/i.test(l));
    let nombreReceptor: string | undefined;
    let rutReceptor: string | undefined;
    if (receptorLine) {
    // Nombre hasta "Rut:"
    const nameMatch = receptorLine.match(/Señor\(es\):\s*(.*?)\s*Rut:/i);
    if (nameMatch) nombreReceptor = nameMatch[1].trim();

    // RUT: permite "16.840.767- K", "16.840.767-K" o "16.840.767K" (menos común)
    const rutMatch = receptorLine.match(/Rut:\s*([0-9.]+(?:\s*-\s*|\s*)[0-9Kk])/i);
    if (rutMatch) rutReceptor = normalizeRut(rutMatch[1]);
    }

  // --- Fecha: prioriza dd/mm/yyyy de “Fecha / Hora Emisión:” ---
  let fecha: string | undefined;
  const emisionLine = lines.find(l => /Fecha\s*\/\s*Hora\s*Emisi[oó]n/i.test(l));
  if (emisionLine) {
    const m = emisionLine.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (m) fecha = m[1];
  }
  // fallback: “Fecha: 21 de Octubre de 2025” -> dejamos la cadena original
  if (!fecha) {
    const fechaLine = lines.find(l => /^Fecha:/i.test(l));
    if (fechaLine) {
      const m2 = fechaLine.replace(/^Fecha:\s*/i, '').trim();
      if (m2) fecha = m2;
    }
  }

  // --- Descripción cerca de “Por atención profesional:” + línea siguiente
  let descripcion: string | null = null;
  const idxDesc = lines.findIndex(l => /Por atenci[oó]n profesional/i.test(l));
  if (idxDesc >= 0) {
    // Puede venir en la misma línea o en la siguiente
    const next = lines[idxDesc + 1] || '';
    // En tu PDF aparece “PSICOTERAPIA 28.000”: separamos el último monto
    const descPart = next.replace(/\s*\d[\d\.\,]*\s*$/, '').trim();
    descripcion = descPart || null;
  }

  // --- Total: “Total Honorarios: $:” y *monto en la línea siguiente* ---
  // 1) buscar la línea del título
  let total: number | null = null;
  let idxTotal = lines.findIndex(l => /Total\s+Honorarios/i.test(l));
  if (idxTotal >= 0) {
    // intenta monto en la misma línea
    const sameLine = lines[idxTotal].match(/Total\s+Honorarios.*?([\d\.\,]+(?:,-)?)/i)?.[1];
    if (sameLine) {
      total = normalizeMoneyToNumber(sameLine);
    } else {
      // si no está, mira la siguiente línea (tu caso: “28.000” en la línea de abajo)
      const maybeAmount = lines[idxTotal + 1] || '';
      const m = maybeAmount.match(/([\d\.\,]+(?:,-)?)/);
      if (m) total = normalizeMoneyToNumber(m[1]) ?? null;
    }
  }
  // Fallback: si no lo encontró, busca el **último número** con formato monto en todo el texto
  if (total == null) {
    const allAmounts = Array.from(T.matchAll(/([\d]{1,3}(\.[\d]{3})+|\d+)(,\d{1,2})?/g)).map(m => m[0]);
    if (allAmounts.length) {
      const last = allAmounts[allAmounts.length - 1];
      total = normalizeMoneyToNumber(last);
    }
  }

  // No siempre vienen neto/retención en boleta exenta
  const neto = null;
  const retencion = null;

  return {
    rutEmisor,
    nombreEmisor,
    rutReceptor,
    nombreReceptor,
    fecha,
    total,
    descripcion
  };
}
