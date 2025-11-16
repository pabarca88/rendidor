import { PdfParser, CampoBoleta } from './types';
import { normalizeMoneyToNumber } from '../number';

function clean(t: string): string {
  return t
    .replace(/\r/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ ]+\n/g, '\n')
    .trim();
}

function normalizeRut(raw: string): string {
  return raw
    .replace(/\./g, '')
    .replace(/[−–—]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/^(\d+)\s+([Kk0-9])$/, '$1-$2')
    .toUpperCase()
    .trim();
}

export const facturaAfectaElectronicaParser: PdfParser = {
  id: 'factura_afecta',
  label: 'Factura Afecta Electrónica (SII)',
  detectScore: (text) => {
    let s = 0;
    if (/FACTURA AFECTA ELECTR[ÓO]NICA/i.test(text)) s += 0.6;
    if (/Monto Neto/i.test(text)) s += 0.2;
    if (/Monto Total/i.test(text)) s += 0.2;
    return s;
  },
  parse: (text: string): CampoBoleta => {
    const T = clean(text);
    const lines = T.split('\n').map(l => l.trim()).filter(Boolean);

    // --- Emisor ---
    // Buscamos el primer bloque de texto antes de “FACTURA AFECTA ELECTRÓNICA”
    const idxFactura = lines.findIndex(l => /FACTURA AFECTA ELECTR[ÓO]NICA/i.test(l));
    let nombreEmisor: string | undefined;
    let rutEmisor: string | undefined;

    if (idxFactura > 0) {
      for (let i = idxFactura - 5; i >= 0; i--) {
        const l = lines[i];
        if (/spa|ltda|limitada|sociedad|comercial|empresa/i.test(l)) {
          nombreEmisor = l;
          break;
        }
      }
      const rutLine = lines.slice(0, idxFactura + 1).find(l => /\d{1,3}\.\d{3}\.\d{3}-[0-9Kk]/.test(l));
      if (rutLine) rutEmisor = normalizeRut(rutLine);
    }

    // --- Receptor (Cliente) ---
    const idxCliente = lines.findIndex(l => /^Cliente\./i.test(l));
    let nombreReceptor: string | undefined;
    let rutReceptor: string | undefined;

    if (idxCliente >= 0) {
      for (let i = idxCliente; i < idxCliente + 10; i++) {
        const l = lines[i] || '';
        if (/^Cliente/i.test(l)) {
          nombreReceptor = lines[i + 1]?.trim();
        }
        if (/^R\.U\.T\./i.test(l)) {
          rutReceptor = lines[i + 1] ? normalizeRut(lines[i + 1]) : undefined;
        }
      }
    }

    // --- Fecha de emisión ---
    const fecha =
      lines.find(l => /Fecha\s*Emisi[oó]n/i.test(l))?.match(/(\d{1,2}[-/]\d{1,2}[-/]\d{4})/)?.[1] || undefined;

    // --- Montos ---
    const montoNetoLine = lines.find(l => /Monto\s+Neto/i.test(l));
    const ivaLine = lines.find(l => /Monto\s+I\.V\.A/i.test(l));
    const totalLine = lines.find(l => /Monto\s+Total/i.test(l));

    const montoNeto =
      montoNetoLine ? normalizeMoneyToNumber(lines[lines.indexOf(montoNetoLine) + 1] || '') : null;
    const iva =
      ivaLine ? normalizeMoneyToNumber(lines[lines.indexOf(ivaLine) + 1] || '') : null;
    const total =
      totalLine ? normalizeMoneyToNumber(lines[lines.indexOf(totalLine) + 1] || '') : null;

    // --- Descripción ---
    const idxDesc = lines.findIndex(l => /^PROTOTIPOS VARIOS/i.test(l) || /^Descripción/i.test(l));
    let descripcion = null;
    if (idxDesc >= 0) {
      descripcion = lines[idxDesc].trim();
    }

    return {
      rutEmisor,
      nombreEmisor,
      rutReceptor,
      nombreReceptor,
      fecha,
      total,
      neto: montoNeto,
      retencion: iva, // aquí va el IVA si lo quieres ver
      descripcion
    };
  },
};
