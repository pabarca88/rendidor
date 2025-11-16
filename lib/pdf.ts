// lib/pdf.ts
import type { Buffer } from 'node:buffer';

export async function pdfBufferToText(buf: Buffer): Promise<string> {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);

  // ⚠️ Importamos la ENTRADA CJS exacta del paquete
  const pdfParse: (b: Buffer) => Promise<{ text?: string }> =
    require('pdf-parse/lib/pdf-parse.js');

  /*
  const data = await pdfParse(buf);
  console.log( '🟢 Texto extraído del PDF (raw):', data.text );
  return (data.text || '').replace(/\u0000/g, '').trim();
  */

  const data = await pdfParse(buf);
  const text = (data.text || '')
    .replace(/\u0000/g, '')
    .trim();

  // Solo primera página (pdf-parse separa páginas con '\f')
  const firstPage = text.split('\f')[0] || text;

  return firstPage;

}
