import { parseEuros } from '@/shared/domain/money'
import { normalizeHeader, type ImportSchema } from '@/shared/domain/table-import'
import type { LedgerEntry, LedgerKind } from '@/shared/domain/types'

export type LedgerInput = Omit<LedgerEntry, 'id' | 'tenantId'>

const kinds: Record<string, LedgerKind> = {
  ingreso: 'income',
  ingresos: 'income',
  income: 'income',
  gasto: 'expense',
  gastos: 'expense',
  expense: 'expense',
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Accepts 2026-03-15, 15/03/2026, 15-03-26 or an Excel date serial. Returns null if not a real date. */
function parseDate(input: string): string | null {
  let year: number, month: number, day: number
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(input)
  const local = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(input)
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (local) {
    ;[day, month, year] = [Number(local[1]), Number(local[2]), Number(local[3])]
    if (year < 100) year += 2000
  } else if (/^\d{5}(\.\d+)?$/.test(input) && Number(input) > 36526 && Number(input) < 73050) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(input)) * 86_400_000)
    return date.toISOString().slice(0, 10)
  } else return null
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

export const ledgerImportSchema: ImportSchema<LedgerInput> = {
  singular: 'apunte',
  plural: 'apuntes contables (ingresos y gastos)',
  columns: [
    { label: 'Fecha', required: true, hint: 'Formato DD/MM/AAAA.', example: '15/03/2026' },
    { label: 'Tipo', required: true, hint: 'Solo: Ingreso o Gasto.', example: 'Gasto' },
    { label: 'Concepto', aliases: ['Descripción'], required: true, hint: 'Texto corto.', example: 'Compra de azulejos' },
    { label: 'Categoría', aliases: ['Categoria'], hint: 'Si se deja vacío será Otros.', example: 'Materiales' },
    { label: 'IVA %', aliases: ['IVA'], hint: 'Porcentaje, sin el símbolo %. Si se deja vacío será 0.', example: '21' },
    { label: 'Total', aliases: ['Importe'], required: true, hint: 'Importe con IVA incluido, positivo, coma decimal, sin símbolo de moneda.', example: '1210,00' },
  ],
  parse(row) {
    const date = parseDate(row['Fecha'] ?? '')
    if (!date) return { ok: false, error: `Fecha no válida: ${row['Fecha'] ?? ''}` }
    const rawKind = row['Tipo'] ?? ''
    const kind = kinds[normalizeHeader(rawKind)]
    if (!kind) return { ok: false, error: `Tipo no válido: ${rawKind || '(vacío)'}. Usa Ingreso o Gasto.` }
    const concept = row['Concepto'] ?? ''
    if (!concept) return { ok: false, error: 'Falta el concepto.' }
    const rawTotal = (row['Total'] ?? '').replace(/[€$]/g, '')
    if (!/^-?[\d.,\s]+$/.test(rawTotal)) return { ok: false, error: `Importe no válido: ${row['Total'] ?? ''}` }
    const amountCents = Math.abs(parseEuros(rawTotal))
    if (amountCents === 0) return { ok: false, error: 'El importe no puede ser 0.' }
    const vatText = (row['IVA %'] ?? '').replace('%', '').replace(',', '.')
    const vatRate = vatText ? Number(vatText) : 0
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) return { ok: false, error: `IVA no válido: ${row['IVA %'] ?? ''}` }
    return {
      ok: true,
      value: {
        kind,
        date,
        concept,
        category: row['Categoría'] || 'Otros',
        amountCents,
        vatRate,
        estimateId: null,
        milestoneId: null,
      },
    }
  },
  duplicateKeys: (e) => [`${e.date}|${e.kind}|${e.concept.toLowerCase()}|${e.amountCents}`],
}

export function ledgerKeys(entries: LedgerEntry[]): Set<string> {
  return new Set(entries.flatMap((entry) => ledgerImportSchema.duplicateKeys(entry)))
}
