import { beforeEach, describe, expect, it, vi } from 'vitest'

const from = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase/client', () => ({ createBrowserSupabaseClient: () => ({ from }) }))

import { loadHandoffIncidents, loadHandoffTiming } from './client-handoff-repository'

const scope = { tenantId: 'tenant', clientId: 'client', locationId: 'centre' }
const now = new Date('2026-11-09T10:00:00Z')
const visit = {
  title: 'Servicio de prueba',
  location_id: 'centre',
  scheduled_start_at: '2026-11-08T09:00:00Z',
  actual_start_at: null,
  actual_end_at: null,
  performed_on: null,
}

function read(data: unknown, error: unknown = null) {
  const end = Promise.resolve({ data, error })
  const query = Object.assign(end, {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    not: vi.fn(),
    abortSignal: vi.fn(),
    maybeSingle: vi.fn(() => end),
  })
  for (const name of [
    'select',
    'eq',
    'gte',
    'order',
    'limit',
    'is',
    'in',
    'not',
    'abortSignal',
  ] as const)
    query[name].mockReturnValue(query)
  return query
}

beforeEach(() => {
  from.mockReset()
})

describe('ficha de relevo acotada a empresa, cliente y centro', () => {
  it('elige el último servicio con fecha real, una visita en curso y una próxima programada', async () => {
    const paper = read({ ...visit, performed_on: '2026-11-09' })
    const app = read({ ...visit, actual_end_at: '2026-11-08T19:00:00Z' })
    const active = read({ ...visit, title: 'Activa' })
    const next = read({ ...visit, title: 'Siguiente' })
    from
      .mockReturnValueOnce(paper)
      .mockReturnValueOnce(app)
      .mockReturnValueOnce(active)
      .mockReturnValueOnce(next)
    const signal = new AbortController().signal
    const detail = await loadHandoffTiming({ ...scope, signal, now })
    expect(detail.last?.performed_on).toBe('2026-11-09')
    expect(detail.active?.title).toBe('Activa')
    expect(detail.next?.title).toBe('Siguiente')
    expect(from).toHaveBeenCalledTimes(4)
    for (const req of [paper, app, active, next]) {
      expect(req.eq).toHaveBeenCalledWith('tenant_id', 'tenant')
      expect(req.eq).toHaveBeenCalledWith('client_id', 'client')
      expect(req.eq).toHaveBeenCalledWith('location_id', 'centre')
      expect(req.limit).toHaveBeenCalledWith(1)
      expect(req.abortSignal).toHaveBeenCalledWith(signal)
      expect(req.select.mock.calls[0]?.[0]).not.toMatch(
        /notes|person|assignee|assigned_user|phone|email|address|latitude|snapshot/,
      )
    }
    expect(paper.not).toHaveBeenCalledWith('performed_on', 'is', null)
    expect(app.is).toHaveBeenCalledWith('performed_on', null)
    expect(active.eq).toHaveBeenCalledWith('status', 'in_progress')
    expect(next.eq).toHaveBeenCalledWith('status', 'scheduled')
    expect(next.gte).toHaveBeenCalledWith('scheduled_start_at', now.toISOString())
  })

  it('no confunde una fecha prevista con un cierre real en registros antiguos', async () => {
    from
      .mockReturnValueOnce(read(null))
      .mockReturnValueOnce(read(null))
      .mockReturnValueOnce(read(null))
      .mockReturnValueOnce(read(null))
    const fallback = read(visit)
    from.mockReturnValueOnce(fallback)
    const result = await loadHandoffTiming({ ...scope, locationId: null, now })
    expect(result.last?.performed_on).toBeNull()
    expect(result.last?.actual_end_at).toBeNull()
    expect(fallback.is).toHaveBeenCalledWith('performed_on', null)
    expect(fallback.is).toHaveBeenCalledWith('actual_end_at', null)
    expect(fallback.eq).not.toHaveBeenCalledWith('location_id', expect.anything())
  })

  it('limita incidencias abiertas reales, sin descripciones ni datos personales', async () => {
    const req = read(Array.from({ length: 6 }, (_, i) => ({ id: String(i), status: 'open' })))
    from.mockReturnValueOnce(req)
    const result = await loadHandoffIncidents(scope)
    expect(result.items).toHaveLength(5)
    expect(result.hasMore).toBe(true)
    expect(req.eq.mock.calls).toEqual([
      ['tenant_id', 'tenant'],
      ['client_id', 'client'],
      ['location_id', 'centre'],
    ])
    expect(req.in).toHaveBeenCalledWith('status', ['open', 'in_progress', 'reopened'])
    expect(req.select).toHaveBeenCalledWith('id,title,location_id,status,due_at,updated_at')
    expect(req.limit).toHaveBeenCalledWith(6)
  })

  it('no transforma un error de permisos o de red en un ámbito sin actividad', async () => {
    from.mockReturnValue(read(null, 'denied'))
    await expect(loadHandoffTiming({ ...scope, now })).rejects.toThrow('No se pudieron comprobar')
    await expect(loadHandoffIncidents(scope)).rejects.toThrow('No se pudieron comprobar')
  })
})
