import { describe, expect, it } from 'vitest'

import type { Estimate, TenantData } from '../domain/types'
import type { AppState } from './store'
import { isInvoicedRemovalFailure, recoverInvoicedRemovals } from './store-recovery'

const estimate: Estimate = {
  id: 'estimate',
  tenantId: 'tenant',
  clientId: 'client',
  number: 'P-1',
  title: 'Original',
  status: 'draft',
  lines: [
    {
      id: 'line',
      catalogItemId: null,
      description: 'Servicio',
      kind: 'labor',
      unit: 'ud',
      quantity: 1,
      unitPriceCents: 10000,
      discountPercent: 0,
    },
  ],
  milestones: [
    { id: 'first', label: 'Señal', percent: 50 },
    { id: 'billed', label: 'Final', percent: 50 },
  ],
  vatRate: 21,
  discountType: 'none',
  discountValue: 0,
  clauses: '',
  validUntil: '2026-12-01',
  createdAt: '2026-11-01',
}
const tenant: TenantData = {
  tenant: {
    id: 'tenant',
    name: 'Empresa',
    taxId: '',
    email: '',
    phone: '',
    defaultVatRate: 21,
    defaultDepositPercent: 30,
    nextEstimateNumber: 2,
  },
  estimates: [estimate],
  clients: [],
  catalog: [],
  ledger: [],
  invoices: [
    {
      id: 'invoice',
      tenantId: 'tenant',
      clientId: 'client',
      number: 'F-1',
      estimateId: 'estimate',
      milestoneId: 'billed',
      workExtraId: null,
      concept: 'Final',
      totalCents: 6050,
      paidCents: 0,
      vatRate: 21,
      status: 'issued',
      documentStatus: 'issued',
      emailAcceptedAt: null,
      issuedAt: '2026-11-01',
      dueDate: '2026-12-01',
    },
  ],
}
const state = (patch: Partial<TenantData> = {}): AppState => ({
  activeTenantId: 'tenant',
  tenants: { tenant: { ...tenant, ...patch } },
})
const data = (snapshot: AppState | undefined) => {
  const tenantData = snapshot?.tenants.tenant
  if (!tenantData) throw new Error('Expected recovered tenant data')
  return tenantData
}

describe('invoiced-source queue recovery', () => {
  it('restores only the billed milestone, preserving other removals and edited fields', () => {
    const previous = state()
    const next = state({ estimates: [{ ...estimate, title: 'Editado', milestones: [] }] })
    const [recovered] = recoverInvoicedRemovals([{ previous, next }], previous)
    expect(data(recovered?.next).estimates[0]).toMatchObject({
      title: 'Editado',
      milestones: [{ id: 'billed' }],
    })
    expect(data(next).estimates[0]?.milestones).toEqual([])
  })

  it('restores a deleted source, including children removed by the failed legacy save', () => {
    const previous = state()
    const server = state({
      estimates: [{ ...estimate, title: 'Actualizado en servidor', lines: [] }],
    })
    const [recovered] = recoverInvoicedRemovals(
      [{ previous, next: state({ estimates: [] }) }],
      server,
    )
    expect(recovered?.previous).toBe(server)
    expect(data(recovered?.next).estimates[0]).toMatchObject({
      title: 'Actualizado en servidor',
      lines: estimate.lines,
      milestones: estimate.milestones,
    })
  })

  it('retains later local edits and creations without repeating the invalid removal', () => {
    const deleted = state({ estimates: [] })
    const draft = { ...estimate, id: 'new-estimate', number: 'P-2' }
    const later = state({
      tenant: { ...tenant.tenant, name: 'Nombre editado' },
      estimates: [draft],
    })
    const recovered = recoverInvoicedRemovals(
      [
        { previous: state(), next: deleted },
        { previous: deleted, next: later },
      ],
      state(),
    )
    const final = data(recovered[1]?.next)
    expect(final.tenant.name).toBe('Nombre editado')
    expect(final.estimates.map((item) => item.id)).toEqual(['new-estimate', 'estimate'])
    expect(recovered[1]?.previous).toBe(recovered[0]?.next)
  })

  it('uses server invoices absent from the stale local snapshot', () => {
    const [recovered] = recoverInvoicedRemovals(
      [{ previous: state({ invoices: [] }), next: state({ invoices: [], estimates: [] }) }],
      state(),
    )
    expect(data(recovered?.next).estimates).toEqual([estimate])
    expect(data(recovered?.next).invoices).toEqual(tenant.invoices)
  })

  it('keeps concurrent server rows and fields that the local edit did not change', () => {
    const extra = { ...estimate, id: 'server-estimate', number: 'P-3' }
    const server = state({
      tenant: { ...tenant.tenant, phone: '123' },
      estimates: [estimate, extra],
    })
    const next = state({ tenant: { ...tenant.tenant, name: 'Local' }, estimates: [] })
    const [recovered] = recoverInvoicedRemovals([{ previous: state(), next }], server)
    expect(data(recovered?.next).tenant).toMatchObject({ name: 'Local', phone: '123' })
    expect(data(recovered?.next).estimates.map((item) => item.id)).toEqual([
      'estimate',
      'server-estimate',
    ])
  })

  it('restores the billed milestone at its original position', () => {
    const [recovered] = recoverInvoicedRemovals(
      [
        {
          previous: state(),
          next: state({
            estimates: [{ ...estimate, milestones: estimate.milestones.slice(0, 1) }],
          }),
        },
      ],
      state(),
    )
    expect(data(recovered?.next).estimates[0]?.milestones).toEqual(estimate.milestones)
  })

  it('rejects replaying an edit on a concurrently deleted row rather than recreating it', () => {
    expect(() =>
      recoverInvoicedRemovals(
        [
          {
            previous: state(),
            next: state({
              estimates: [{ ...estimate, title: 'Local' }],
            }),
          },
        ],
        state({ estimates: [] }),
      ),
    ).toThrow('ya no existe')
  })

  it('does not replay edits to a tenant that is no longer accessible', () => {
    expect(() =>
      recoverInvoicedRemovals([{ previous: state(), next: state({ estimates: [] }) }], {
        activeTenantId: 'other',
        tenants: {},
      }),
    ).toThrow('empresa ya no está disponible')
  })

  it('recognizes old FK failures but not transient or unrelated errors', () => {
    expect(
      isInvoicedRemovalFailure(
        'estimate_milestones: violates invoices_milestone_id_tenant_id_fkey',
      ),
    ).toBe(true)
    expect(isInvoicedRemovalFailure('Sin conexión')).toBe(false)
    expect(isInvoicedRemovalFailure('permission denied')).toBe(false)
  })
})
