import { PdfParser } from "./types";
import { normalizeMoneyToNumber } from "../number";

function clean(t: string): string {
  return t
    .replace(/\r/g, "")
    .replace(/[−–—]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

// helper para montos: "LABEL .... $1.234,56"
function getMoney(text: string, label: string): number | null {
  const r = new RegExp(label + String.raw`[^\n$]*\$ ?([\d.,]+)`, "i");
  const m = text.match(r);
  if (!m) return null;
  return normalizeMoneyToNumber(m[1]);
}

export const liquidacionTipo3Parser: PdfParser = {
  id: "liquidacion_tipo3",
  label: "Liquidación (Hydroionic SPA)",

  detectScore(text: string) {
    let score = 0;

    if (text.includes("LIQUIDACION DE SUELDOS")) score += 2;
    if (text.includes("HABERES")) score += 1;
    if (text.includes("DESCUENTOS")) score += 1;

    return score;
  },

  parse(raw: string) {
    const text = clean(raw);

    // ===== Nombre =====
    const nombreMatch = text.match(/Nombre:\s*([^\n]+)/i);
    const nombre = nombreMatch ? nombreMatch[1].trim() : null;

    // ===== RUT (segundo rut = trabajador) =====
    const rutMatches = Array.from(
      text.matchAll(/Rut:\s*([\d.]+-[0-9kK])/gi)
    );
    const rut =
      rutMatches.length >= 2
        ? rutMatches[1][1]
        : rutMatches[0]?.[1] ?? null;

    // ===== Periodo = Fecha de ingreso =====
    const periodoMatch = text.match(/Fecha de Ingreso:\s*([\d/]+)/i);
    const periodo = periodoMatch ? periodoMatch[1].trim() : null;

    // ===== N° documento = mes de la fecha de ingreso =====
    let numero: string | null = null;
    if (periodo) {
    const partes = periodo.split("/"); // dd/mm/aaaa
    const mesStr = partes[1];          // "10"
    if (mesStr) {
        const mesNum = parseInt(mesStr, 10);
        if (!Number.isNaN(mesNum)) {
        numero = mesNum.toString();    // "10"
        }
    }
    }

    // ===== Montos =====
    const sueldoBase = getMoney(text, "SUELDO BASE");
    const gratificacion = getMoney(text, "GRATIFICACION LEGAL");
    const totalImponible = getMoney(text, "TOTAL IMPONIBLE");
    const colacion = getMoney(text, "COLACION 30 DIAS");
    const movilizacion = getMoney(text, "MOVILIZACION 30 DIAS");
    const totalNoImponible = getMoney(text, "TOTAL NO IMPONIBLE");
    const totalHaberes = getMoney(text, "TOTAL HABERES");
    const fonasa = getMoney(text, "FONASA 7 %");
    const afp = getMoney(text, "UNO 10.49 %");
    const seguroCesantia = getMoney(text, "SEGURO CESANTIA");
    const complemento = getMoney(text, "Complementario");
    const totalDescuentos = getMoney(text, "TOTAL DESCUENTOS");
    const liquido = getMoney(text, "LIQUIDO A PAGO");
    const totalTributable = getMoney(text, "TOTAL TRIBUTABLE");

    const descripcion = "Liquidación de remuneraciones";

    return {
      rutEmisor: rut,
      nombreEmisor: nombre,
      rutReceptor: null,
      nombreReceptor: null,

      // 👇 En tu UI esto se mapea a "Periodo"
      fecha: periodo,          // 12/10/2023

      // 👇 N° documento = número de mes
      numero,                  // "5" para mayo

      // 👇 Monto total (imponible) → TOTAL IMPONIBLE
      total: totalImponible,   // 1054143 → se verá 1.054.143

      neto: totalImponible,
      retencion: null,
      descripcion,

      // extras
      sueldoBase,
      gratificacion,
      totalImponible,
      colacion,
      movilizacion,
      totalNoImponible,
      totalHaberes,
      fonasa,
      afp,
      seguroCesantia,
      complemento,
      totalDescuentos,
      liquido,
      totalTributable,
    };
  },
};

