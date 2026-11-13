import { describe, expect, it } from 'vitest'

import type { TenantData } from '@/shared/domain/types'

import { businessSearchItems, searchItems, type SearchItem } from './search'

const navigation: SearchItem[] = [
  { id: 'nav', title: 'Clientes', category: 'Navegación', target: { to: '/clientes' } },
]
const data: TenantData = {
  tenant: {
    id: 'one',
    name: 'Empresa',
    taxId: '',
    email: '',
    phone: '',
    defaultVatRate: 21,
    defaultDepositPercent: 30,
    nextEstimateNumber: 1,
  },
  clients: [
    {
      id: 'a',
      tenantId: 'one',
      name: 'Clínica Álvarez',
      taxId: 'B123',
      email: 'contact@example.test',
      phone: '123456789',
      address: '',
      notes: '',
    },
    {
      id: 'b',
      tenantId: 'two',
      name: 'Empresa ajena',
      taxId: '',
      email: '',
      phone: '',
      address: '',
      notes: '',
    },
    {
      id: 'c',
      tenantId: 'one',
      name: 'Cliente archivado',
      archivedAt: '2026-01-01',
      taxId: '',
      email: '',
      phone: '',
      address: '',
      notes: '',
    },
  ],
  estimates: [
    {
      id: 'p',
      tenantId: 'one',
      number: 'P-2026-042',
      clientId: 'a',
      title: 'Limpieza mensual',
      status: 'draft',
      lines: [],
      discountType: 'none',
      discountValue: 0,
      vatRate: 21,
      milestones: [],
      clauses: '',
      validUntil: '',
      createdAt: '',
    },
  ],
  invoices: [],
  ledger: [
    {
      id: 'l',
      tenantId: 'one',
      kind: 'expense',
      date: '2026-10-03',
      concept: 'Materiales obra',
      category: 'Materiales',
      amountCents: 10000,
      vatRate: 21,
      estimateId: null,
      milestoneId: null,
    },
  ],
  catalog: [
    {
      id: 'x',
      tenantId: 'one',
      name: 'Cristales',
      sku: 'CR-42',
      category: 'Limpieza',
      kind: 'labor',
      unit: 'h',
      unitPriceCents: 2000,
    },
  ],
}

describe('global resource search', () => {
  it('searches names, references and related clients ignoring accents and typos', () => {
    const index = businessSearchItems(data)
    expect(searchItems(index, 'alvarez').map((item) => item.id)).toEqual(['client:a', 'estimate:p'])
    expect(searchItems(index, 'clinica').map((item) => item.id)).toContain('client:a')
    expect(searchItems(index, 'cristals')[0]?.id).toBe('catalog:x')
    expect(searchItems(index, 'P-2026-042')[0]?.target).toEqual({
      to: '/presupuestos/$estimateId',
      params: { estimateId: 'p' },
    })
    expect(searchItems(index, 'CR-42')[0]?.target).toEqual({
      to: '/catalogo',
      search: { q: 'CR-42' },
    })
    expect(searchItems(index, 'Materiales obra')[0]?.target).toEqual({
      to: '/contabilidad',
      search: { tab: 'apuntes', q: 'Materiales obra' },
    })
  })

  it('excludes foreign and archived clients and all untyped business data', () => {
    const index = businessSearchItems(data)
    expect(index.map((item) => item.id)).not.toContain('client:b')
    expect(index.map((item) => item.id)).not.toContain('client:c')
    expect(searchItems([...navigation, ...index], '')).toEqual(navigation)
    expect(searchItems([...navigation, ...index], '   ')).toEqual(navigation)
    expect(searchItems(index, 'noexiste')).toEqual([])
  })

  it('ranks exact names first and prevents a large category from hiding other resources', () => {
    const many = Array.from({ length: 150 }, (_, i): SearchItem => ({
      id: `${i}`,
      title: `Cliente ${i}`,
      category: 'Clientes',
      target: { to: '/clientes' },
    }))
    const results = searchItems(
      [
        ...many,
        { id: 'exact', title: 'Cliente', category: 'Navegación', target: { to: '/clientes' } },
      ],
      'Cliente',
    )
    expect(results[0]?.category).toBe('Navegación')
    expect(results.filter((item) => item.category === 'Clientes')).toHaveLength(5)
  })
})
