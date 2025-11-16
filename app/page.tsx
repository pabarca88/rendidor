"use client";

import { useState } from "react";
import * as XLSX from "xlsx";

type ApiResponse = {
  ok: boolean;
  error?: string;
  fields?: any;
  confidence?: number;
  formatId?: string;
};

const PARSER_OPTIONS = [
  { id: "auto", label: "Auto (recomendado)" },
  { id: "sii_clasico", label: "SII boleta clásica" },
  { id: "sii_var_b", label: "SII variante B" },
  { id: "factura_afecta", label: "Factura Afecta Electrónica (SII)" },
  { id: "factura_electronica_moderna", label: "Factura Electrónica (SII moderna)" },
  { id: "factura_simple", label: "Factura Electrónica (SII simple)" },
  { id: "factura_retail", label: "Factura Electrónica (SII retail / e-commerce)" },
  { id: "nota_credito", label: "Nota de crédito" },
  { id: "liquidacion", label: "Liquidación de remuneraciones" },
];

// Fila que irá al Excel (1 por documento)
type DocumentoFila = {
  cuenta: string;                 // *
  item: string;                   // *
  fuenteFinanciamiento: string;   // *
  periodo: string;                // fecha boleta/factura
  tipoDocumento: string;
  numeroDocumento: string;
  rut: string;
  nombre: string;
  montoTotal: number | null;
  montoARendir: string;           // *
  valorHora: string;              // *
  horasRendidasMes: string;       // *
  formaPago: string;              // *
  fechaPago: string;              // *
  fechaDocumento: string;         // *
  glosa: string;
};

export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [apiResult, setApiResult] = useState<ApiResponse | null>(null);

  // Documento en edición (formulario para el documento actual)
  const [draft, setDraft] = useState<DocumentoFila | null>(null);

  // Lista de documentos ya guardados para el Excel
  const [documentos, setDocumentos] = useState<DocumentoFila[]>([]);

  function inferTipoDocumento(resp: ApiResponse, selectedFormat: string) {
    if (resp.formatId) return resp.formatId;
    if (selectedFormat !== "auto") return selectedFormat;
    return "desconocido";
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setApiResult(null);
    setDraft(null);

    const fd = new FormData();
    fd.append("pdf", file);
    if (format !== "auto") fd.append("format", format);

    const res = await fetch("/api/extract", { method: "POST", body: fd });
    const json = (await res.json()) as ApiResponse;

    setApiResult(json);
    setLoading(false);

    if (!json.ok || !json.fields) return;

    const f = json.fields || {};

    // armamos un borrador con los datos auto extraídos
    const nuevoDraft: DocumentoFila = {
      cuenta: "",
      item: "",
      fuenteFinanciamiento: "",
      periodo: f.fecha ?? "", // periodo = fecha del documento
      tipoDocumento: inferTipoDocumento(json, format),
      numeroDocumento: f.numero ?? f.folio ?? "", // si lo tienes en tus parsers, si no queda vacío
      rut: f.rutEmisor ?? f.rut ?? "",
      nombre: f.nombreEmisor ?? f.nombre ?? "",
      montoTotal:
        typeof f.total === "number"
          ? f.total
          : typeof f.neto === "number"
          ? f.neto
          : null,
      montoARendir: "",
      valorHora: "",
      horasRendidasMes: "",
      formaPago: "",
      fechaPago: "",
      fechaDocumento: f.fecha ?? "",
      glosa: f.descripcion ?? "",
    };

    setDraft(nuevoDraft);
  }

  function updateDraft<K extends keyof DocumentoFila>(key: K, value: DocumentoFila[K]) {
    if (!draft) return;
    setDraft({ ...draft, [key]: value });
  }

  function guardarDocumentoActual() {
    if (!draft) return;
    // podrías validar campos obligatorios acá si quieres
    setDocumentos((prev) => [...prev, draft]);
    setDraft(null);
    setApiResult(null);
    setFile(null);
  }

  function eliminarDocumento(idx: number) {
    setDocumentos((prev) => prev.filter((_, i) => i !== idx));
  }

  function descargarExcel() {
    if (documentos.length === 0) return;

    // Orden de columnas según lo que pediste
    const dataParaExcel = documentos.map((d) => ({
      "Cuenta": d.cuenta,
      "Item": d.item,
      "Fuente de financiamiento": d.fuenteFinanciamiento,
      "Periodo": d.periodo,
      "Tipo de documento": d.tipoDocumento,
      "N° de documento": d.numeroDocumento,
      "Rut": d.rut,
      "Nombre": d.nombre,
      "Monto total (imponible)": d.montoTotal ?? "",
      "Monto a rendir": d.montoARendir,
      "Valor hora": d.valorHora,
      "Horas rendidas/mes": d.horasRendidasMes,
      "Forma de pago": d.formaPago,
      "Fecha de pago": d.fechaPago,
      "Fecha del documento": d.fechaDocumento,
      "Glosa": d.glosa,
    }));

    const ws = XLSX.utils.json_to_sheet(dataParaExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rendicion");

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rendicion.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-dvh p-6 mx-auto max-w-3xl space-y-6 bg-gray-50 text-black">
      <h1 className="text-2xl font-semibold mb-2">Rendidor de documentos (PDF)</h1>

      {/* Formulario de subida */}
      <form onSubmit={onSubmit} className="space-y-4 border rounded-xl p-4">
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm mb-1">Archivo PDF</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Formato</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="border rounded-md px-2 py-2 w-full"
            >
              {PARSER_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="submit"
          disabled={!file || loading}
          className="px-4 py-2 rounded-2xl shadow bg-black text-white disabled:opacity-40"
        >
          {loading ? "Procesando…" : "Extraer datos"}
        </button>
      </form>

      {/* Mensaje de error de la API */}
      {apiResult && !apiResult.ok && (
        <div className="rounded-xl p-4 bg-red-100 text-red-800">
          {apiResult.error ?? "Error procesando PDF"}
        </div>
      )}

      {/* Formulario de edición del documento actual */}
      {draft && (
        <section className="border rounded-xl p-4 space-y-4 bg-gray-50 text-black opacity-100">
          <h2 className="font-semibold text-lg">Documento actual</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Campos manuales (*) */}
            <div>
              <label className="block text-xs font-medium">
                Cuenta <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full border rounded px-2 py-1"
                value={draft.cuenta}
                onChange={(e) => updateDraft("cuenta", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium">
                Item <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full border rounded px-2 py-1"
                value={draft.item}
                onChange={(e) => updateDraft("item", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium">
                Fuente de financiamiento <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full border rounded px-2 py-1"
                value={draft.fuenteFinanciamiento}
                onChange={(e) =>
                  updateDraft("fuenteFinanciamiento", e.target.value)
                }
              />
            </div>

            <div>
              <label className="block text-xs font-medium">
                Monto a rendir <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full border rounded px-2 py-1"
                value={draft.montoARendir}
                onChange={(e) => updateDraft("montoARendir", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium">
                Valor hora <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full border rounded px-2 py-1"
                value={draft.valorHora}
                onChange={(e) => updateDraft("valorHora", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium">
                Horas rendidas/mes <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full border rounded px-2 py-1"
                value={draft.horasRendidasMes}
                onChange={(e) =>
                  updateDraft("horasRendidasMes", e.target.value)
                }
              />
            </div>

            <div>
              <label className="block text-xs font-medium">
                Forma de pago <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full border rounded px-2 py-1"
                value={draft.formaPago}
                onChange={(e) => updateDraft("formaPago", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium">
                Fecha de pago <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className="w-full border rounded px-2 py-1"
                value={draft.fechaPago}
                onChange={(e) => updateDraft("fechaPago", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium">
                Fecha del documento <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className="w-full border rounded px-2 py-1"
                value={draft.fechaDocumento}
                onChange={(e) => updateDraft("fechaDocumento", e.target.value)}
              />
            </div>

            {/* Campos auto extraídos pero editables */}
            <div>
              <label className="block text-xs font-medium">Periodo</label>
              <input
                className="w-full border rounded px-2 py-1"
                value={draft.periodo}
                onChange={(e) => updateDraft("periodo", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium">Tipo de documento</label>
              <input
                className="w-full border rounded px-2 py-1"
                value={draft.tipoDocumento}
                onChange={(e) => updateDraft("tipoDocumento", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium">N° de documento</label>
              <input
                className="w-full border rounded px-2 py-1"
                value={draft.numeroDocumento}
                onChange={(e) =>
                  updateDraft("numeroDocumento", e.target.value)
                }
              />
            </div>

            <div>
              <label className="block text-xs font-medium">RUT</label>
              <input
                className="w-full border rounded px-2 py-1"
                value={draft.rut}
                onChange={(e) => updateDraft("rut", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium">Nombre</label>
              <input
                className="w-full border rounded px-2 py-1"
                value={draft.nombre}
                onChange={(e) => updateDraft("nombre", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium">
                Monto total (imponible)
              </label>
              <input
                className="w-full border rounded px-2 py-1"
                value={draft.montoTotal ?? ""}
                onChange={(e) =>
                  updateDraft(
                    "montoTotal",
                    e.target.value ? Number(e.target.value) : null
                  )
                }
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium">Glosa</label>
            <textarea
              className="w-full border rounded px-2 py-1"
              rows={2}
              value={draft.glosa}
              onChange={(e) => updateDraft("glosa", e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={guardarDocumentoActual}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white"
            >
              Guardar documento
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="px-4 py-2 rounded-xl border"
            >
              Cancelar
            </button>
          </div>
        </section>
      )}

      {/* Tabla de documentos ya agregados */}
      {documentos.length > 0 && (
        <section className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">
              Documentos agregados ({documentos.length})
            </h2>
            <button
              type="button"
              onClick={descargarExcel}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white"
            >
              Descargar Excel
            </button>
          </div>

          <div className="overflow-auto border rounded-xl">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-2 py-1 text-left">N° doc</th>
                  <th className="px-2 py-1 text-left">Nombre</th>
                  <th className="px-2 py-1 text-right">Monto total</th>
                  <th className="px-2 py-1 text-left">Cuenta</th>
                  <th className="px-2 py-1 text-left">Item</th>
                  <th className="px-2 py-1"></th>
                </tr>
              </thead>
              <tbody>
                {documentos.map((d, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-2 py-1">{d.numeroDocumento}</td>
                    <td className="px-2 py-1">{d.nombre}</td>
                    <td className="px-2 py-1 text-right">
                      {d.montoTotal ?? ""}
                    </td>
                    <td className="px-2 py-1">{d.cuenta}</td>
                    <td className="px-2 py-1">{d.item}</td>
                    <td className="px-2 py-1 text-right">
                      <button
                        type="button"
                        onClick={() => eliminarDocumento(idx)}
                        className="text-red-600"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
