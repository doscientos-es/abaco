import { beforeEach, describe, expect, it, vi } from 'vitest'

const from = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase/client', () => ({ createBrowserSupabaseClient: () => ({ from }) }))

import { monthlyClientReportLimit } from '../domain/monthly-client-report'
import { loadMonthlyClientReport } from './monthly-client-report-repository'

function read(result: object) {
  const chain = Object.assign(Promise.resolve(result), {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    abortSignal: vi.fn(),
  })
  for (const method of [
    chain.select,
    chain.eq,
    chain.gte,
    chain.lt,
    chain.order,
    chain.limit,
    chain.abortSignal,
  ])
    method.mockReturnValue(chain)
  return chain
}

const scope = {
  tenantId: 'tenant-a',
  clientId: 'client-a',
  locationId: 'centre-a',
  month: '2026-11',
}
const visit = {
  id: 'internal-visit-id',
  title: 'Mantenimiento',
  scheduled_start_at: '2026-11-02T10:00:00Z',
  status: 'completed',
  location: { name: 'Nave 1' },
  notes: 'NOTA PRIVADA',
}
const extra = {
  id: 'internal-extra-id',
  description: 'Limpieza de juntas',
  proposed_at: '2026-11-04T10:00:00Z',
  status: 'approved',
  quantity: 2,
  unit: 'h',
  work: { location: [{ name: 'Nave 1' }] },
  unit_cost_cents: 12000,
}

beforeEach(() => {
  from.mockReset()
})

describe('lectura del informe acotada por empresa, cliente, centro y mes', () => {
  it('solo lee datos operativos de cada ámbito vigente y nunca consulta precios, facturas ni notas', async () => {
    const visits = read({ data: [visit] })
    const extras = read({ data: [extra] })
    from.mockReturnValueOnce(visits).mockReturnValueOnce(extras)
    const signal = new AbortController().signal
    const report = await loadMonthlyClientReport({ ...scope, signal })
    expect(from.mock.calls).toEqual([['service_visits'], ['work_order_extras']])
    expect(visits.eq.mock.calls).toEqual([
      ['tenant_id', 'tenant-a'],
      ['client_id', 'client-a'],
      ['location_id', 'centre-a'],
    ])
    expect(extras.eq.mock.calls).toEqual([
      ['tenant_id', 'tenant-a'],
      ['work.tenant_id', 'tenant-a'],
      ['work.client_id', 'client-a'],
      ['work.location_id', 'centre-a'],
    ])
    expect(extras.select.mock.calls[0]?.[0]).toContain('work:work_orders!inner(')
    expect(visits.gte).toHaveBeenCalledWith('scheduled_start_at', '2026-10-31T23:00:00.000Z')
    expect(visits.lt).toHaveBeenCalledWith('scheduled_start_at', '2026-11-30T23:00:00.000Z')
    expect(extras.gte).toHaveBeenCalledWith('proposed_at', '2026-10-31T23:00:00.000Z')
    expect(extras.lt).toHaveBeenCalledWith('proposed_at', '2026-11-30T23:00:00.000Z')
    for (const request of [visits, extras]) {
      expect(request.limit).toHaveBeenCalledWith(monthlyClientReportLimit + 1)
      expect(request.abortSignal).toHaveBeenCalledWith(signal)
      expect(request.select.mock.calls[0]?.[0]).not.toMatch(
        /notes|snapshot|cost|price|invoice|email|address/i,
      )
    }
    expect(report).toEqual({
      visits: [
        {
          id: visit.id,
          title: visit.title,
          date: visit.scheduled_start_at,
          status: 'completed',
          centre: 'Nave 1',
        },
      ],
      extras: [
        {
          id: extra.id,
          title: extra.description,
          date: extra.proposed_at,
          status: 'approved',
          centre: 'Nave 1',
          quantity: 2,
          unit: 'h',
        },
      ],
    })
  })

  it('acepta todos los centros e incluye los registros sin centro', async () => {
    const visits = read({ data: [{ ...visit, location: null }] })
    const extras = read({ data: [{ ...extra, work: null }] })
    from.mockReturnValueOnce(visits).mockReturnValueOnce(extras)
    const report = await loadMonthlyClientReport({ ...scope, locationId: null })
    expect(visits.eq).not.toHaveBeenCalledWith('location_id', expect.anything())
    expect(extras.eq).not.toHaveBeenCalledWith('work.location_id', expect.anything())
    expect(report.visits[0]?.centre).toBe('Sin centro')
    expect(report.extras[0]?.centre).toBe('Sin centro')
  })

  it('no crea un PDF parcial si falta una lectura o hay más de lo que permite el informe', async () => {
    from
      .mockReturnValueOnce(read({ data: [visit] }))
      .mockReturnValueOnce(read({ error: { message: 'privado' } }))
    await expect(loadMonthlyClientReport(scope)).rejects.toThrow(
      'No se pudo cargar el informe completo',
    )
    from
      .mockReturnValueOnce(read({ data: Array(monthlyClientReportLimit + 1).fill(visit) }))
      .mockReturnValueOnce(read({ data: [] }))
    await expect(loadMonthlyClientReport(scope)).rejects.toThrow(
      'No se ha preparado un informe parcial',
    )
  })

  it('no lee la base de datos con un mes inválido', async () => {
    await expect(loadMonthlyClientReport({ ...scope, month: '2026-13' })).rejects.toThrow(
      'Elige un mes válido',
    )
    expect(from).not.toHaveBeenCalled()
  })
})
