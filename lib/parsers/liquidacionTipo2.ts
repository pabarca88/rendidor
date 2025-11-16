import { PdfParser, CampoBoleta } from "./types";
import { normalizeMoneyToNumber } from "../number";

function clean(t: string): string {
  return t
    .replace(/\r/g, "")
    .replace(/[−–—]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ ]+\n/g, "\n")
    .trim();
}

function normalizeRut(raw: string): string {
  return raw
    .replace(/\./g, "")
    .replace(/[−–—]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .toUpperCase()
    .trim();
}

// ==============================
//  Conversión de nombre de mes → número
// ==============================
const meses: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

function mesToNumber(periodo?: string): number | null {
  if (!periodo) return null;
  const lower = periodo.toLowerCase();
  for (const m in meses) {
    if (lower.includes(m)) return meses[m];
  }
  return null;
}

// ==============================
//  Extraer CARGO
// ==============================
function extractCargo(lines: string[]): string | null {
  // 1) Caso simple: CARGO : valor en la misma línea
  for (const l of lines) {
    const m = l.match(/CARGO\s*:\s*(.+)/i);
    if (m && m[1].trim()) return m[1].trim();
  }

  // 2) Caso dividido en 2 líneas:
  //    "CARGO :" en una línea
  //    valor en la línea siguiente
  for (let i = 0; i < lines.length; i++) {
    if (/^CARGO\s*:?\s*$/i.test(lines[i])) {
      const next = lines[i + 1]?.trim();
      if (next && next.length > 3) return next;
    }
    if (/CARGO\s*:\s*$/i.test(lines[i])) {
      const next = lines[i + 1]?.trim();
      if (next && next.length > 3) return next;
    }
  }

  return null;
}

// ==============================
// PARSER PRINCIPAL
// ==============================
export const liquidacionTipo2Parser: PdfParser = {
  id: "liquidacion_tipo2",
  label: "Liquidación (formato simple)",

  detectScore: (text) => {
    let s = 0;

    // Este formato tiene estas señales claras
    if (/RUT\s+TRABAJADOR/i.test(text)) s += 2;
    if (/Per[ií]odo\s*:/i.test(text)) s += 1;
    if (/Base\s+Imponible/i.test(text)) s += 1;

    return s;
  },

  parse: (raw) => {
    const T = clean(raw);
    const lines = T.split("\n").map((l) => l.trim()).filter(Boolean);

    // 1) PRIMERA LÍNEA = nombre trabajador
    const nombre = lines[0]?.trim();

    // 2) SEGUNDA LÍNEA = rut trabajador
    const rut = normalizeRut(lines[1] || "");

    // 3) Período
    const periodoMatch = T.match(/Per[ií]odo\s*:\s*([^\n]+)/i);
    const periodo = periodoMatch ? periodoMatch[1].trim() : undefined;

    // 4) Numero del documento = número del mes
    const numero = mesToNumber(periodo)?.toString() ?? null;

    // 5) Cargo
    const cargo = extractCargo(lines);

    // 6) Glosa = cargo + período
    const descripcion =
      cargo && periodo
        ? `${cargo} ${periodo}`
        : "Liquidación de remuneraciones";

    // =========================
    //   TOTAL IMPONIBLE
    // =========================
    let totalImponible: number | null = null;

    // A) Intentar obtener imponible desde la LÍNEA 6
    if (lines.length >= 6) {
      const rawLine6 = lines[5].replace(/\s+/g, "");
      const m = rawLine6.match(/([\d\.]+)/);
      if (m) totalImponible = normalizeMoneyToNumber(m[1]);
    }

    // B) FALLBACK: si línea 6 falla o es muy bajo (< 300.000)
    if (!totalImponible || totalImponible < 300000) {
      const allNums = Array.from(
        T.matchAll(/(\d{1,3}(?:\.\d{3})+|\d+)/g)
      ).map((m) => normalizeMoneyToNumber(m[1]));

      // tomar solo valores grandes típicos de imponible
      const candidates = allNums.filter((n) => n > 300000);

      if (candidates.length) {
        totalImponible = Math.max(...candidates);
      }
    }

    return {
      rutEmisor: rut,
      nombreEmisor: nombre,
      rutReceptor: undefined,
      nombreReceptor: undefined,
      fecha: periodo,
      numero,             // <-- Número = mes
      total: totalImponible,
      neto: null,
      retencion: null,
      descripcion,        // <-- Glosa = cargo + periodo
    };
  },
};
