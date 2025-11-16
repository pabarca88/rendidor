// lib/parsers/liquidacionRemuneraciones.ts
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

function extraerMesNumero(mes: string): number | null {
  const mapa: Record<string, number> = {
    ENERO: 1,
    FEBRERO: 2,
    MARZO: 3,
    ABRIL: 4,
    MAYO: 5,
    JUNIO: 6,
    JULIO: 7,
    AGOSTO: 8,
    SEPTIEMBRE: 9,
    OCTUBRE: 10,
    NOVIEMBRE: 11,
    DICIEMBRE: 12,
  };
  return mapa[mes.toUpperCase()] ?? null;
}

export const liquidacionRemuneracionesParser: PdfParser = {
  id: "liquidacion",
  label: "Liquidación de remuneraciones",

  detectScore(text) {
    let s = 0;
    const t = text.replace(/\s+/g, " ").toUpperCase();

    if (/LIQUIDACION/.test(t)) s += 0.7;
    if (/REMUNERACION/.test(t)) s += 0.5;
    if (/SUELDO/.test(t)) s += 0.3;
    if (/HABERES/.test(t)) s += 0.2;
    if (/TOTAL HABERES/.test(t)) s += 0.2;
    if (/TOTAL DESCUENTOS/.test(t)) s += 0.2;

    return s;
  },

  parse(raw: string): CampoBoleta {
    const T = clean(raw);
    const lines = T.split("\n").map((l) => l.trim()).filter(Boolean);

    const rutRegex = /(\d{1,2}\.?\d{3}\.?\d{3}-[0-9Kk])/;

    // ---------------------------
    // EMPRESA (primeras líneas)
    // ---------------------------
    const nombreEmpresa = lines[0];
    const rutEmpresaMatch = T.match(rutRegex);
    const rutEmpresa = rutEmpresaMatch
      ? normalizeRut(rutEmpresaMatch[1])
      : undefined;

    // ---------------------------
    // TRABAJADOR: penúltima y última línea
    // ---------------------------
    let rutTrabajador: string | undefined;
    let nombreTrabajador: string | undefined;

    if (lines.length >= 2) {
      const last = lines[lines.length - 1];
      const prev = lines[lines.length - 2];

      const m = last.match(rutRegex);
      if (m) {
        rutTrabajador = normalizeRut(m[1]);
        if (prev && !rutRegex.test(prev)) {
          nombreTrabajador = prev.trim();
        }
      }
    }

    console.log("🟣 Penúltima línea (nombre posible):", lines[lines.length - 2]);
    console.log("🟣 Última línea (rut posible):", lines[lines.length - 1]);
    console.log("🟢 RUT trabajador detectado:", rutTrabajador);
    console.log("🟢 Nombre trabajador detectado:", nombreTrabajador);

    // ---------------------------
    // Fallback por si cambia el formato
    // ---------------------------
    if (!rutTrabajador || !nombreTrabajador) {
      const allRuts = lines
        .map((l) => {
          const m = l.match(rutRegex);
          return m ? normalizeRut(m[1]) : null;
        })
        .filter(Boolean) as string[];

      const ultimoRutDistinto = allRuts
        .slice()
        .reverse()
        .find((r) => !rutEmpresa || r !== rutEmpresa);

      if (ultimoRutDistinto) {
        rutTrabajador = ultimoRutDistinto;

        const idx = lines.findIndex((l) => l.includes(rutTrabajador!));
        if (idx > 0) {
          const prev = lines[idx - 1];
          if (prev && !rutRegex.test(prev)) {
            nombreTrabajador = prev.trim();
          }
        }
      }

      console.log("🟡 Fallback → RUT trabajador:", rutTrabajador);
      console.log("🟡 Fallback → Nombre trabajador:", nombreTrabajador);
    }

    // ---------------------------
    // PERÍODO (antepenúltima línea tipo "J U N I O  2 0 2 5")
    // ---------------------------
    let periodo: string | undefined;

    if (lines.length >= 3) {
      const rawPeriodoLine = lines[lines.length - 3]; // antepenúltima
      const compact = rawPeriodoLine.replace(/\s+/g, ""); // "JUNIO2025"

      const m = compact.match(
        /(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)(\d{4})/i
      );

      if (m) {
        const mes = m[1].toUpperCase();
        const anio = m[2];
        // "JUNIO 2025"
        periodo = `${mes.charAt(0)}${mes.slice(1).toLowerCase()} ${anio}`;
      }
    }

    // Fallback: buscar en todo el texto por si acaso
    if (!periodo) {
      const match = T.match(
        /(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+20\d{2}/i
      );
      if (match) {
        const mesRaw = match[1].toUpperCase();
        const [anioRaw] = match[0].match(/20\d{2}/) || [];
        if (anioRaw) {
          periodo = `${mesRaw.charAt(0)}${mesRaw.slice(1).toLowerCase()} ${anioRaw}`;
        }
      }
    }

    console.log("🟢 Periodo detectado:", periodo);

    // Nº documento = número del mes
    let numero: number | null = null;
    if (periodo) {
      const mes = periodo.split(" ")[0]; // "Junio"
      numero = extraerMesNumero(mes);
    }

    console.log("🟢 Número de documento (mes):", numero);

    // ---------------------------
    // CARGO (para la glosa)
    // ---------------------------
    let cargo: string | undefined;
    const cargoLine = lines.find((l) => /^Cargo/i.test(l));
    if (cargoLine) {
      const m = cargoLine.match(/Cargo:\s*(.*)/i);
      cargo = m ? m[1].trim() : undefined;
    }

    // ---------------------------
    // TOTAL IMPONIBLE
    // ---------------------------
    let totalImponible: number | null = null;
    const m1 = T.match(/TOTAL\s+IMPONIBLE\s*\$?\s*([\d\.\,]+)/i);
    if (m1) {
      totalImponible = normalizeMoneyToNumber(m1[1]);
    }

    // ---------------------------
    // GLOSA
    // ---------------------------
    const glosa =
      cargo && periodo ? `${cargo} ${periodo}` : "Liquidación de remuneraciones";

    console.log("🟢 RUT trabajador antes del return:", rutTrabajador);
    console.log("🟢 Nombre trabajador antes del return:", nombreTrabajador);

    return {
      // Para tu formulario quieres que el RUT/NOMBRE sea el trabajador,
      // así que usamos los datos del trabajador como "emisor" y "receptor".
      rutEmisor: rutTrabajador,
      nombreEmisor: nombreTrabajador,

      rutReceptor: rutTrabajador,
      nombreReceptor: nombreTrabajador,

      fecha: periodo,
      // @ts-ignore
      numero,

      total: totalImponible,
      neto: null,
      retencion: null,
      descripcion: "Liquidación " + periodo,
    };
  },
};
