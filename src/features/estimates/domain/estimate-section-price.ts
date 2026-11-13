import type { ContractBillingFrequency } from '@/shared/domain/contract-billing'
import { calculateTotals, estimateTotals, lineNetCents } from '@/shared/domain/estimate'
import { estimateSectionLabels, type EstimateSection } from '@/shared/domain/estimate-document'
import { formLimits } from '@/shared/domain/form-limits'
import { formatEuros } from '@/shared/domain/money'
import { eurosInWords } from '@/shared/domain/money-in-words'
import type { Estimate } from '@/shared/domain/types'

import { replaceSectionLines } from './estimate-sections'

export type PriceSection = Extract<EstimateSection, { type: 'prices' }>

export function estimatePriceFrequency(estimate: Estimate): ContractBillingFrequency {
  return (
    estimate.contractBillingFrequency ??
    (estimate.conversionDestination === 'contract' ? 'monthly' : 'once')
  )
}

export function sectionPriceBeforeDiscount(estimate: Estimate, section: PriceSection): number {
  return calculateTotals(
    estimate.lines.filter((line) => section.lineIds.includes(line.id)),
    estimate.vatRate,
  ).totalCents
}

/** Allocate discounts and VAT cumulatively so all price paragraphs add up to the payable total. */
export function sectionPriceTotal(estimate: Estimate, section: PriceSection): number {
  const totals = estimateTotals(estimate)
  const netTotal = totals.subtotalCents + totals.globalDiscountCents
  if (netTotal === 0) return 0
  const ids = new Set(section.lineIds)
  let accumulated = 0
  let previous = 0
  let price = 0
  for (const line of estimate.lines) {
    accumulated += lineNetCents(line)
    const base = accumulated - Math.round((totals.globalDiscountCents * accumulated) / netTotal)
    const current = base + Math.round((base * estimate.vatRate) / 100)
    if (ids.has(line.id)) price += current - previous
    previous = current
  }
  return price
}

export function changeSectionPrice(
  estimate: Estimate,
  section: PriceSection,
  amountCents: number,
  newId: () => string,
): { ok: true; patch: Partial<Estimate> } | { ok: false; error: string } {
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents < 0 ||
    amountCents > Math.round(formLimits.monetaryAmount * 100)
  ) {
    return { ok: false, error: 'Introduce un precio válido con un máximo de dos decimales.' }
  }
  const existing = estimate.lines.find((line) => section.lineIds.includes(line.id))
  if (
    existing &&
    section.title.trim() &&
    amountCents === sectionPriceBeforeDiscount(estimate, section)
  ) {
    return { ok: true, patch: {} }
  }
  const base = Math.round(amountCents / (1 + estimate.vatRate / 100))
  const actual = base + Math.round((base * estimate.vatRate) / 100)
  if (actual !== amountCents) {
    return {
      ok: false,
      error: `Con el IVA del ${estimate.vatRate}%, el precio con impuestos más cercano es ${formatEuros(actual)}. Introduce ese importe para que el precio y el resumen coincidan.`,
    }
  }
  const patch = replaceSectionLines(estimate, section.id, [
    {
      id: existing?.id ?? newId(),
      catalogItemId: null,
      description: section.title || 'Importe presupuestado',
      kind: 'labor',
      unit: 'ud',
      quantity: 1,
      unitPriceCents: base,
      discountPercent: 0,
    },
  ])
  if (!patch.sections) return { ok: false, error: 'La sección de precio ya no existe.' }
  return {
    ok: true,
    patch: {
      ...patch,
      sections: patch.sections.map((item) =>
        item.id === section.id && !item.title.trim()
          ? { ...item, title: estimateSectionLabels.prices }
          : item,
      ),
    },
  }
}

export function sectionPriceNarrative(amountCents: number, frequency: ContractBillingFrequency) {
  const period = { once: 'ÚNICA', monthly: 'MENSUAL', quarterly: 'TRIMESTRAL', yearly: 'ANUAL' }[
    frequency
  ]
  const numeric = formatEuros(amountCents).replace(/\s*€$/, '')
  return {
    heading: `PRESUPUESTO ${frequency === 'once' ? 'ÚNICO' : period}. -`,
    body: `Asciende el presente presupuesto a la cantidad ${period} de ${eurosInWords(amountCents)} (${numeric}.-) impuestos incluidos.`,
  }
}
