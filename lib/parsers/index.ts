import { PdfParser, ParseResult } from './types';
import { siiClasicoParser } from './siiClasico';
import { siiVarBParser } from './siiVarB';
import { notaCreditoElectronicaParser } from './notaCreditoElectronica';
import { facturaSiiUniversalParser } from "./facturaSiiUniversal";
import { liquidacionRemuneracionesParser } from "./liquidacionRemuneraciones";
import { liquidacionTipo2Parser } from "./liquidacionTipo2";

// import { facturaAfectaElectronicaParser } from './facturaAfectaElectronica';
// import { facturaElectronicaModernaParser } from './facturaElectronicaModerna';
// import { facturaElectronicaSimpleParser } from './facturaElectronicaSimple';
// import { facturaElectronicaRetailParser } from './facturaElectronicaRetail';

export const parsers = [
  siiClasicoParser,              // boletas honorarios
  notaCreditoElectronicaParser, // NC
  facturaSiiUniversalParser,    // TODAS las facturas SII
  liquidacionRemuneracionesParser,
   liquidacionTipo2Parser, 
];


export const PARSERS: PdfParser[] = [
  siiClasicoParser,
  siiVarBParser,
  facturaSiiUniversalParser,
  notaCreditoElectronicaParser,
  liquidacionRemuneracionesParser
];

export function detectBestParser(text: string): { parser: PdfParser; confidence: number } {
  let best = PARSERS[0];
  let bestScore = 0;
  for (const p of PARSERS) {
    const s = p.detectScore(text) || 0;
    if (s > bestScore) {
      best = p; bestScore = s;
    }
  }
  return { parser: best, confidence: bestScore };
}

export function parseWith(text: string, forced?: string) {
  if (forced && forced !== "auto") {
    const p = parsers.find((x) => x.id === forced);
    if (!p) throw new Error("Parser no encontrado: " + forced);
    return { formatId: forced, confidence: 1, fields: p.parse(text) };
  }

  console.log("🟡 detectando parser…");
  for (const p of parsers) {
    console.log(`→ ${p.id}: score = ${p.detectScore(text)}`);
  }

  const scored = parsers
    .map((p) => ({ p, score: p.detectScore(text) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];

  console.log("🟢 Parser elegido:", best.p.id, "score =", best.score);

  return {
    formatId: best.p.id,
    confidence: best.score,
    fields: best.p.parse(text),
  };
}

export const PARSER_OPTIONS = PARSERS.map(p => ({ id: p.id, label: p.label }));
