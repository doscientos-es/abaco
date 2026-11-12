import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { formatEuros } from '@/shared/domain/money'
import type { Estimate, EstimateStatus } from '@/shared/domain/types'

import { EstimateStatusSummary } from './estimate-status-summary'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/presupuestos">{children}</a>,
}))

function estimate(id: string, status: EstimateStatus, amount: number): Estimate {
  return {
    id,
    status,
    tenantId: 'tenant',
    number: id,
    clientId: 'client',
    title: id,
    lines: [
      {
        id: 'line',
        catalogItemId: null,
        description: '',
        kind: 'other',
        unit: 'ud',
        quantity: 1,
        unitPriceCents: amount,
        discountPercent: 0,
      },
    ],
    discountType: 'none',
    discountValue: 0,
    vatRate: 0,
    milestones: [],
    clauses: '',
    validUntil: '',
    createdAt: '',
  }
}

describe('EstimateStatusSummary', () => {
  it('shows the empty state only when there are no estimates', () => {
    const html = renderToStaticMarkup(<EstimateStatusSummary estimates={[]} />)
    expect(html).toContain('Aún no hay presupuestos')
    expect(html).toContain('Ir a presupuestos')
  })

  it('keeps zero-value estimates visible with their counts', () => {
    const html = renderToStaticMarkup(
      <EstimateStatusSummary estimates={[estimate('1', 'draft', 0)]} />,
    )
    expect(html).not.toContain('Aún no hay presupuestos')
    const rows = html.match(/<li\b.*?<\/li>/g) ?? []
    expect(rows).toHaveLength(4)
    expect(rows[0]).toContain('Borrador')
    expect(rows[0]).toContain('1 presupuesto')
    expect(rows[0]).toContain(formatEuros(0))
  })

  it('shows status counts and VAT-inclusive amounts with proportional segments', () => {
    const taxed = { ...estimate('1', 'accepted', 10000), vatRate: 21 }
    const html = renderToStaticMarkup(
      <EstimateStatusSummary
        estimates={[taxed, estimate('2', 'accepted', 0), estimate('3', 'sent', 12100)]}
      />,
    )
    const rows = html.match(/<li\b.*?<\/li>/g) ?? []
    expect(html).toContain(formatEuros(24200))
    expect(html).toContain('3 presupuestos')
    expect(rows[1]).toContain('Publicado')
    expect(rows[1]).toContain('1 presupuesto')
    expect(rows[2]).toContain('Aceptado')
    expect(rows[2]).toContain('2 presupuestos')
    expect(rows[2]).toContain(formatEuros(12100))
    expect(html.match(/width:50%/g)).toHaveLength(2)
  })
})
