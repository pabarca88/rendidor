export type CampoBoleta = {
  rutEmisor?: string;
  nombreEmisor?: string;
  rutReceptor?: string;
  nombreReceptor?: string;
  fecha?: string;
  total?: number | null;
  neto?: number | null;
  retencion?: number | null;
  descripcion?: string | null;
  numero?: string | null;
};

export type ParseResult = {
  fields: CampoBoleta;
  confidence: number;     // 0–1
  formatId: string;       // id del parser que ganó
  diagnostics?: string[]; // opcional: por qué
};

export interface PdfParser {
  id: string;                 // ej: "sii_clasico"
  label: string;              // ej: "SII boleta clásica"
  detectScore: (text: string) => number; // heurística 0–1
  parse: (text: string) => CampoBoleta;  // extracción efectiva
}
