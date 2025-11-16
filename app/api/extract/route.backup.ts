export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pdfBufferToText } from '@/lib/pdf';
import { parseWith } from '@/lib/parsers';

const FileSchema = z.custom<File>((v) => v instanceof File, { message: 'Archivo inválido' });
const FormSchema = z.object({
  pdf: FileSchema,
  format: z.string().optional(), // <- nuevo
});

console.log("🚀 API /api/extract iniciada en runtime Node.js");

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const pdf = form.get('pdf');
    const format = (form.get('format') as string) || undefined;

    const parsed = FormSchema.safeParse({ pdf, format });
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Debes adjuntar un PDF.' }, { status: 400 });
    }

    const file = parsed.data.pdf as File;
    if (file.type !== 'application/pdf' && !file.name?.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ ok: false, error: 'El archivo debe ser un PDF.' }, { status: 400 });
    }

    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);
    console.log("🟡 Recibí el archivo PDF:", file.name);
    const text = await pdfBufferToText(buf);
    console.log('📄 Texto plano extraído del PDF:\n', text);
    if (!text || text.length < 20) {
      return NextResponse.json({ ok: false, error: 'PDF sin texto (posible escaneo). Agrega OCR.' }, { status: 422 });
    }

    const result = parseWith(text, format); // <- parser auto o forzado
    // 👇 incluimos el texto crudo en la respuesta (para depurar)
    return NextResponse.json({
      ok: true,
      ...result,
      rawText: text.slice(0, 3000) // limita a 3000 caracteres para no saturar
    });
  } catch (err: any) {
    console.error('[extract] error:', err);
    return NextResponse.json({ ok: false, error: err?.message ?? 'Error procesando PDF' }, { status: 500 });
  }
}
