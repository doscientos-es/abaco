import { beforeEach, describe, expect, it, vi } from 'vitest'

import { emptyDocumentLibrary } from '@/shared/domain/document-library'
import { defaultEstimateDesign } from '@/shared/domain/estimate-design'
import type { Estimate, TenantData } from '@/shared/domain/types'
import {
  currentTenantData,
  getSaveStatus,
  hydrateStore,
  newId,
  retryStoreSaves,
  setRepository,
  type AppState,
} from '@/shared/store/store'
import {
  estimateFromRow,
  estimateToRow,
  tenantFromRow,
  tenantToRow,
} from '@/shared/store/supabase-mappers'

import { changeSectionPrice } from '../domain/estimate-section-price'
import { buildEstimateDraft, estimatePurposePatch, newEstimateError } from '../domain/new-estimate'
import { createEstimate, patchEstimate, submitEstimateDraft } from './estimate-actions'

const initial = (): TenantData => ({
  tenant: {
    id: 'tenant',
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
      id: 'client',
      tenantId: 'tenant',
      name: 'Cliente',
      taxId: '',
      email: '',
      phone: '',
      address: '',
      notes: '',
    },
  ],
  estimates: [],
  catalog: [],
  ledger: [],
  invoices: [],
})
const save = vi.fn<(previous: AppState, next: AppState) => Promise<undefined>>()
let data: TenantData

beforeEach(async () => {
  data = initial()
  save.mockReset().mockResolvedValue(undefined)
  setRepository({
    load: async () => ({ activeTenantId: 'tenant', tenants: { tenant: data } }),
    save,
  })
  await hydrateStore()
})

function completeDraft(): Estimate {
  const draft = buildEstimateDraft(data.tenant, 'client', 'Servicio mensual', 'sections', newId)
  const section = draft.sections?.find((item) => item.type === 'prices')
  if (section?.type !== 'prices') throw new Error('Missing price section')
  const result = changeSectionPrice(draft, section, 21_632, newId)
  if (!result.ok) throw new Error(result.error)
  return { ...draft, ...result.patch }
}

const saved = () => vi.waitFor(() => expect(getSaveStatus().state).toBe('saved'))

describe('explicit estimate creation', () => {
  it('persists distinct installation and maintenance routes without changing existing estimates', async () => {
    const installation = {
      ...completeDraft(),
      ...estimatePurposePatch('work'),
    }
    submitEstimateDraft(installation)
    await saved()
    const row = estimateToRow(installation)
    expect(row).toMatchObject({
      conversion_destination: 'work',
      automatic_contract: false,
      contract_billing_frequency: 'once',
    })
    expect(estimateFromRow({ ...row, estimate_lines: [], estimate_milestones: [] })).toMatchObject({
      conversionDestination: 'work',
      automaticContract: false,
      contractBillingFrequency: 'once',
    })
    expect(estimatePurposePatch('contract')).toEqual({
      conversionDestination: 'contract',
      automaticContract: true,
      contractBillingFrequency: 'monthly',
    })
    expect(completeDraft()).toMatchObject(estimatePurposePatch('contract'))
  })

  it('copies a named default from the company library into the new draft', () => {
    const id = newId()
    const design = {
      ...defaultEstimateDesign,
      layout: 'editorial',
      appearance: { logoSize: 'large', logoPosition: 'right', accentColor: '#123456' },
    } as const
    const library = {
      ...emptyDocumentLibrary,
      defaultEstimateId: id,
      estimates: [{ id, name: 'Mantenimiento', design }],
    }
    const tenant = tenantFromRow(tenantToRow({ ...data.tenant, documentLibrary: library }))

    const draft = buildEstimateDraft(tenant, 'client', 'Servicio', 'sections', newId)
    expect(tenant.documentLibrary).toEqual(library)
    expect(draft.documentDesign).toEqual(design)
    expect(
      buildEstimateDraft(data.tenant, 'client', 'Servicio', 'sections', newId).documentDesign,
    ).toEqual(defaultEstimateDesign)
  })

  it('copies company defaults on creation and persists a later override only on that draft', async () => {
    const companyDesign = { ...defaultEstimateDesign, layout: 'compact' } as const
    const tenant = tenantFromRow(
      tenantToRow({ ...data.tenant, defaultEstimateDesign: companyDesign }),
    )
    const draft = {
      ...buildEstimateDraft(tenant, 'client', 'Servicio', 'table', newId),
      lines: completeDraft().lines,
    }
    expect(draft.documentDesign).toEqual(companyDesign)
    submitEstimateDraft(draft)
    await saved()
    const design = { ...defaultEstimateDesign, showLogo: false }
    patchEstimate(draft.id, { documentDesign: design })
    await saved()
    const persisted = save.mock.lastCall?.[1].tenants.tenant?.estimates[0]
    expect(persisted?.documentDesign).toEqual(design)
    const row = {
      ...estimateToRow(persisted ?? draft),
      estimate_lines: [],
      estimate_milestones: [],
    }
    expect(estimateFromRow(row).documentDesign).toEqual(design)
    expect(estimateFromRow({ ...row, document_design: null })).not.toHaveProperty('documentDesign')
    expect(tenant.defaultEstimateDesign).toEqual(companyDesign)
  })

  it('prepares and edits a complete local proposal without saving or consuming numbering', () => {
    const draft = completeDraft()
    expect(newEstimateError(draft)).toBeNull()
    expect(draft.lines).toHaveLength(1)
    expect(save).not.toHaveBeenCalled()
    expect(currentTenantData()?.estimates).toEqual([])
    expect(currentTenantData()?.tenant.nextEstimateNumber).toBe(1)
  })

  it('saves a traditional table estimate with its chosen format and prices', async () => {
    const draft = {
      ...buildEstimateDraft(data.tenant, 'client', 'Servicio', 'table', newId),
      lines: completeDraft().lines,
    }
    expect(newEstimateError(draft)).toBeNull()
    submitEstimateDraft(draft)
    await saved()
    expect(currentTenantData()?.estimates[0]).toMatchObject({
      documentFormat: 'table',
      sections: [],
      lines: draft.lines,
    })
  })

  it('saves the entire proposal only on final submit and ignores duplicate submissions', async () => {
    const draft = completeDraft()
    expect(submitEstimateDraft(draft)).toBe(draft.id)
    submitEstimateDraft(draft)
    await saved()
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]?.[0].tenants.tenant?.estimates).toEqual([])
    expect(save.mock.calls[0]?.[1].tenants.tenant?.estimates[0]).toMatchObject({
      id: draft.id,
      sections: draft.sections,
      lines: draft.lines,
      contractBillingFrequency: 'monthly',
      vatRate: 21,
    })
    expect(currentTenantData()?.tenant.nextEstimateNumber).toBe(2)
  })

  it('retains autosave when subsequently editing an existing estimate', async () => {
    const draft = completeDraft()
    submitEstimateDraft(draft)
    await saved()
    patchEstimate(draft.id, { title: 'Título editado' })
    await saved()
    expect(save).toHaveBeenCalledTimes(2)
    expect(currentTenantData()?.estimates[0]?.title).toBe('Título editado')
    expect(currentTenantData()?.tenant.nextEstimateNumber).toBe(2)
  })

  it('retries a failed creation with exactly the same ids and number', async () => {
    save.mockRejectedValueOnce(new Error('Sin conexión'))
    const draft = completeDraft()
    submitEstimateDraft(draft)
    await vi.waitFor(() => expect(getSaveStatus().state).toBe('error'))
    retryStoreSaves()
    await saved()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1]).toEqual(save.mock.calls[0])
    expect(currentTenantData()?.estimates).toHaveLength(1)
    expect(currentTenantData()?.tenant.nextEstimateNumber).toBe(2)
  })

  it('assigns the current number at submit, not the number seen when opening the form', async () => {
    const draft = completeDraft()
    createEstimate('client', 'Otro presupuesto')
    await saved()
    submitEstimateDraft(draft)
    await saved()
    expect(currentTenantData()?.estimates[0]?.number).not.toBe(draft.number)
    expect(currentTenantData()?.tenant.nextEstimateNumber).toBe(3)
  })

  it.each<Partial<Estimate>>([
    { clientId: '' },
    { title: ' ' },
    { validUntil: '' },
    { validUntil: '2026-99-99' },
    { validUntil: '2027-02-30' },
    { lines: [] },
    { sections: [] },
  ])('rejects incomplete forms without creating an empty estimate: %j', (patch) => {
    expect(() => submitEstimateDraft({ ...completeDraft(), ...patch })).toThrow()
    expect(save).not.toHaveBeenCalled()
    expect(currentTenantData()?.estimates).toEqual([])
  })

  it('rejects a draft for a different tenant or an unavailable client', () => {
    expect(() => submitEstimateDraft({ ...completeDraft(), tenantId: 'other' })).toThrow('empresa')
    expect(() => submitEstimateDraft({ ...completeDraft(), clientId: 'missing' })).toThrow(
      'cliente activo',
    )
    expect(save).not.toHaveBeenCalled()
  })
})
