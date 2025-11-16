// pages/api/extract.ts
import type { NextApiRequest, NextApiResponse } from "next";
// @ts-ignore
import Busboy from "busboy";
import { pdfBufferToText } from "@/lib/pdf";
import { parseWith } from "@/lib/parsers";

export const config = {
  api: {
    bodyParser: false, // Necesario para usar Busboy
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método no permitido" });
  }

  const busboy = Busboy({ headers: req.headers });

  let pdfBuffer: Buffer | null = null;
  let forcedFormat: string | undefined;

  // Campos del formulario
  busboy.on("field", (fieldname: string, value: string) => {
    if (fieldname === "format") {
      forcedFormat = value;
    }
  });

  // Archivo PDF
  // @ts-ignore
  busboy.on("file", (_name: string, file, _info) => {
    const chunks: Buffer[] = [];

    file.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    file.on("end", () => {
      pdfBuffer = Buffer.concat(chunks);
    });
  });

  // Fin del procesamiento
  busboy.on("finish", async () => {
    try {
      if (!pdfBuffer) {
        return res
          .status(400)
          .json({ ok: false, error: "No se subió ningún PDF." });
      }

      console.log("📄 PDF recibido. Tamaño:", pdfBuffer.length);

      const text = await pdfBufferToText(pdfBuffer);

      console.log("📝 Texto extraído:");
      console.log(text);

      if (!text || text.length < 10) {
        return res.status(422).json({
          ok: false,
          error: "PDF sin texto. Probablemente es un PDF escaneado.",
        });
      }

      const result = parseWith(text, forcedFormat);

      return res.status(200).json({
        ok: true,
        ...result,
        rawText: text, // opcional para debug en front
      });
    } catch (err: any) {
      console.error("❌ Error procesando PDF:", err);
      return res
        .status(500)
        .json({ ok: false, error: err?.message ?? "Error desconocido" });
    }
  });

  req.pipe(busboy);
}
