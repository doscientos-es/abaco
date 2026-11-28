import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
  gte: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
}))
vi.mock('@/shared/lib/supabase/client', () => ({ createBrowserSupabaseClient: () => db }))
vi.mock('@/shared/store/store', () => ({ getSaveStatus: vi.fn() }))

import { loadEstimateReminder } from './estimate-publication-repository'

const publication = {
  source: 'publication',
  snapshot: {
    estimate: {
      id: 'quote',
      tenant_id: 'tenant',
      client_id: 'customer',
      status: 'sent',
      number: 'P-1',
      title: 'Revisión',
      valid_until: '2099-12-01',
    },
    client: { id: 'customer', tenant_id: 'tenant', name: 'Reparaciones Prueba' },
    tenant: { id: 'tenant', name: 'Demo' },
  },
}

beforeEach(() => {
  vi.resetAllMocks()
  for (const method of [db.from, db.select, db.eq, db.is, db.gte]) method.mockReturnValue(db)
  db.maybeSingle.mockResolvedValueOnce({ data: publication, error: null })
})

describe('acceso al enlace del recordatorio', () => {
  it('lee la publicación y el enlace existente sin publicar, renovar ni escribir', async () => {
    db.maybeSingle.mockResolvedValueOnce({
      data: { client_id: 'customer', public_token: '00000000-0000-4000-8000-000000000001' },
    })
    await expect(loadEstimateReminder('tenant', 'quote')).resolves.toEqual({
      clientId: 'customer',
      recipient: 'Reparaciones Prueba',
      title: 'Revisión',
      company: 'Demo',
      estimateNumber: 'P-1',
      token: '00000000-0000-4000-8000-000000000001',
    })
    expect(db.from.mock.calls).toEqual([['estimate_publications'], ['estimates']])
    expect(db.eq.mock.calls).toEqual([
      ['tenant_id', 'tenant'],
      ['estimate_id', 'quote'],
      ['tenant_id', 'tenant'],
      ['id', 'quote'],
      ['status', 'sent'],
    ])
    expect(db.is).toHaveBeenCalledWith('responded_at', null)
    expect(db.gte).toHaveBeenCalledWith('valid_until', new Date().toISOString().slice(0, 10))
    expect(db.update).not.toHaveBeenCalled()
  })

  it('no devuelve un enlace si no hay un presupuesto vigente y sin respuesta en el ámbito', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    await expect(loadEstimateReminder('tenant', 'quote')).rejects.toThrow(
      'enviado, vigente y sin respuesta',
    )
    expect(db.update).not.toHaveBeenCalled()
  })

  it('no comparte mensaje con un destinatario que no coincide con la publicación', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { client_id: 'other', public_token: 'token' } })
    await expect(loadEstimateReminder('tenant', 'quote')).rejects.toThrow(
      'No se pudo verificar el enlace',
    )
  })

  it('no muestra tokens ni errores internos cuando falla la lectura del enlace', async () => {
    db.maybeSingle.mockResolvedValueOnce({ error: { message: 'error privado' } })
    await expect(loadEstimateReminder('tenant', 'quote')).rejects.toThrow(
      'No se pudo comprobar el presupuesto',
    )
  })
})
