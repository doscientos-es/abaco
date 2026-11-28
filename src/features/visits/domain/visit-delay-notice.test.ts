import { describe, expect, it } from 'vitest'

import { visitCanPrepareDelay, visitDelayDraft, visitDelayTimeError } from './visit-delay-notice'

const visit = {
  status: 'scheduled' as const,
  scheduled_start_at: '2026-11-12T09:00:00Z',
  timezone: 'Europe/Madrid',
}
const now = Date.parse('2026-11-12T09:30:00Z')

describe('aviso de retraso sin datos de contacto', () => {
  it('comprueba el estado, el día civil en el centro y la validez de sus fechas', () => {
    expect(visitCanPrepareDelay(visit, now)).toBe(true)
    expect(visitCanPrepareDelay({ ...visit, status: 'in_progress' }, now)).toBe(false)
    expect(visitCanPrepareDelay({ ...visit, status: 'completed' }, now)).toBe(false)
    expect(visitCanPrepareDelay(visit, Date.parse('2026-11-12T23:30:00Z'))).toBe(false)
    expect(visitCanPrepareDelay({ ...visit, timezone: 'zona inválida' }, now)).toBe(false)
  })

  it('pide una hora elegida de verdad y posterior al inicio previsto y a la hora actual', () => {
    expect(visitDelayTimeError(visit, '', now)).toMatch(/HH:mm/)
    expect(visitDelayTimeError(visit, '24:00', now)).toMatch(/HH:mm/)
    expect(visitDelayTimeError(visit, '10:00', now)).toMatch(/posterior a la hora prevista/)
    expect(visitDelayTimeError(visit, '10:12', now)).toMatch(/todavía no haya pasado/)
    expect(visitDelayTimeError(visit, '10:31', now)).toBeNull()
    expect(visitDelayTimeError(visit, '11:00', Date.parse('2026-11-13T09:00:00Z'))).toMatch(
      /ya no está disponible/,
    )
  })

  it('usa la hora local y no la del dispositivo o la sede', () => {
    const canary = { ...visit, timezone: 'Atlantic/Canary' }
    expect(visitDelayTimeError(canary, '09:45', now)).toBeNull()
    expect(visitDelayTimeError(visit, '09:45', now)).not.toBeNull()
  })

  it('el texto comunica una estimación formal, sin datos de la visita ni garantías', () => {
    expect(visitDelayDraft('10:45')).toBe(
      'Hola. Le avisamos de que la visita prevista para hoy se retrasa. Prevemos llegar sobre las 10:45. Disculpe las molestias.',
    )
  })
})
