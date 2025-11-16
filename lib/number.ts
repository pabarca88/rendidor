export function normalizeMoneyToNumber(raw: string): number | null {
  let s = raw
    .replace(/\s+/g, '')
    .replace(/\.-$/, '')                     // quita ".-"
    .replace(/(\$|CLP|\bTotal\b|\bTOTAL\b)/gi, '')
    .trim();

  if (!s) return null;

  const hasComma = s.includes(',');
  const commaAsDecimal = /,\d{1,2}$/.test(s);

  // Caso 1: coma decimal (típico es-CL: 1.234,56 o 28.000)
  if (hasComma && commaAsDecimal) {
    s = s.replace(/\./g, '').replace(',', '.'); // miles . -> remove, decimal , -> .
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  // Caso 2: sin coma
  if (!hasComma) {
    // ¿Patrón claro de miles con puntos? (12.345 o 1.234.567)
    const thousandsPattern = /^\d{1,3}(\.\d{3})+$/;
    if (thousandsPattern.test(s)) {
      s = s.replace(/\./g, '');
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
    // ¿Formato anglo con punto decimal? (1234.56)
    const dotDecimalPattern = /^\d+\.\d{1,2}$/;
    if (dotDecimalPattern.test(s)) {
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
    // Número plano (sin separadores)
    s = s.replace(/[^\d]/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  // Fallback
  s = s.replace(/[^\d.]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
