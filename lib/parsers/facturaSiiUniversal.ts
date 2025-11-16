import { PdfParser, CampoBoleta } from "./types";
import { normalizeMoneyToNumber } from "../number";

function clean(t: string): string {
  return t
    .replace(/\r/g, "")
    .replace(/[−–—]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normalizeRut(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/\./g, "")
    .replace(/[−–—]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .toUpperCase()
    .trim();
}

export const facturaSiiUniversalParser: PdfParser = {
  id: "factura_sii",
  label: "Factura Electrónica (unificada SII)",

  detectScore(text) {
    let s = 0;

    if (/FACTURA/i.test(text)) s += 0.5;
    if (/MONTO\s+NETO/i.test(text)) s += 0.2;
    if (/I\.?V\.?A/i.test(text)) s += 0.1;
    if (/TOTAL/i.test(text)) s += 0.1;
    if (/Fecha\s+Emisi[oó]n/i.test(text)) s += 0.2;

    // Evitar boletas de honorarios
    if (/HONORARIOS/i.test(text)) s -= 1;

    return s;
  },

  parse(text: string): CampoBoleta {
    const T = clean(text);
    const lines = T.split("\n").map(l => l.trim()).filter(Boolean);

    // --- RUT Emisor ---
    const rutEmisor =
      T.match(/R\.?U\.?T\.?:\s*([0-9.]+[-\s]?[0-9Kk])/i)?.[1] || undefined;

    // --- Nombre Emisor ---
    const nombreEmisor =
      lines.find(l => /(SPA|LTDA|LIMITADA|SOCIEDAD|SERVICIOS|PRODUCCIONES|COMERCIAL)/i.test(l))
      || lines[0];

    // --- RUT Receptor ---
    const rutReceptor =
      T.match(/Señor\(es\)|SEÑOR\(ES\)/i)
        ? T.match(/R\.?U\.?T\.?:\s*([0-9.]+[-\s]?[0-9Kk])/gi)?.[1]
        : undefined;

    // --- Nombre Receptor ---
    let nombreReceptor: string | undefined;
    const idxReceptor = lines.findIndex(l => /SEÑOR\(ES\)/i.test(l));
    if (idxReceptor >= 0) {
      nombreReceptor = lines[idxReceptor].replace(/SEÑOR\(ES\):?/i, "").trim();
    }

    // --- Fecha ---
    const fecha =
      T.match(/Fecha\s+Emision:\s*([0-9]{1,2}\s+de\s+\w+\s+del\s+[0-9]{4})/i)?.[1] ||
      T.match(/Fecha:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i)?.[1] ||
      undefined;

    // --- Número de documento ---
    const numero =
      T.match(/N[°º]\s*:?[-–—]?\s*(\d{1,8})/i)?.[1] ||
      undefined;

    // --- Glosa / descripción ---
    const idxDesc = lines.findIndex(l => /(Servicio|Produccion|Producto|Administraci[oó]n|Código|Descripcion)/i.test(l));
    const descripcion =
      idxDesc >= 0 ? lines[idxDesc].replace(/Código:?/i, "").trim() : null;

    // --- Montos ---
    const neto =
      T.match(/MONTO\s+NETO\s*\$?\s*([\d\.\,]+)/i)?.[1]
        ? normalizeMoneyToNumber(T.match(/MONTO\s+NETO\s*\$?\s*([\d\.\,]+)/i)![1])
        : null;

    const iva =
      T.match(/I\.?V\.?A[^$0-9]*\$?\s*([\d\.\,]+)/i)?.[1]
        ? normalizeMoneyToNumber(T.match(/I\.?V\.?A[^$0-9]*\$?\s*([\d\.\,]+)/i)![1])
        : null;

    const total =
      T.match(/TOTAL\s*\$?\s*([\d\.\,]+)/i)?.[1]
        ? normalizeMoneyToNumber(T.match(/TOTAL\s*\$?\s*([\d\.\,]+)/i)![1])
        : null;

    return {
      rutEmisor: rutEmisor ? normalizeRut(rutEmisor) : undefined,
      nombreEmisor,
      rutReceptor: rutReceptor ? normalizeRut(rutReceptor) : undefined,
      nombreReceptor,
      fecha,
      numero,
      descripcion,
      neto,
      retencion: iva,
      total,
    };
  }
};
