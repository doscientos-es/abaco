import { describe, expect, it } from 'vitest'

import { todayInMadrid } from '@/shared/lib/date-range'

import {
  compareEstimateValidity,
  matchesEstimateFollowUp,
  validateEstimateFollowUpSearch,
} from './estimate-follow-up'

const today = '2026-11-29'
const sent = { status: 'sent', validUntil: '2026-11-28' } as const

describe('seguimiento de presupuestos', () => {
  it('encuentra enviados sin respuesta, incluso sin fecha; excluye borradores y respuestas', () => {
    expect(matchesEstimateFollowUp({ ...sent, validUntil: '' }, 'sin-respuesta', today)).toBe(true)
    for (const status of ['draft', 'accepted', 'rejected'] as const)
      expect(matchesEstimateFollowUp({ ...sent, status }, 'sin-respuesta', today)).toBe(false)
  })

  it('considera pasada una fecha solo después de ese día y no inventa vencimiento', () => {
    expect(todayInMadrid(new Date('2026-11-28T23:30:00Z'))).toBe(today)
    expect(matchesEstimateFollowUp(sent, 'fecha-pasada', today)).toBe(true)
    expect(matchesEstimateFollowUp({ ...sent, validUntil: today }, 'fecha-pasada', today)).toBe(
      false,
    )
    expect(matchesEstimateFollowUp({ ...sent, validUntil: '' }, 'fecha-pasada', today)).toBe(false)
  })

  it('da prioridad a la fecha más cercana y deja los que no la tienen al final', () => {
    const dates = [{ ...sent, validUntil: '' }, { ...sent, validUntil: today }, sent]
    expect(dates.sort(compareEstimateValidity).map((e) => e.validUntil)).toEqual([
      sent.validUntil,
      today,
      '',
    ])
  })

  it('valida enlaces de seguimiento sin aceptar filtros desconocidos', () => {
    expect(validateEstimateFollowUpSearch({ seguimiento: 'fecha-pasada' })).toEqual({
      seguimiento: 'fecha-pasada',
    })
    expect(validateEstimateFollowUpSearch({ seguimiento: ['sin-respuesta'] })).toEqual({})
  })
})
