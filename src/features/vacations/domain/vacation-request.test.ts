import { describe, expect, it } from 'vitest'

import {
  isValidAbsencePeriod,
  isValidVacationPeriod,
  vacationRequestStatusLabels,
} from './vacation-request'

describe('vacation request domain', () => {
  it('accepts one-day and inclusive multi-day date ranges', () => {
    expect(isValidVacationPeriod('2026-11-09', '2026-11-09')).toBe(true)
    expect(isValidVacationPeriod('2026-11-09', '2026-11-12')).toBe(true)
    expect(isValidVacationPeriod('2024-02-29', '2024-03-01')).toBe(true)
  })

  it('rejects reversed and impossible calendar dates', () => {
    expect(isValidVacationPeriod('2026-11-12', '2026-11-09')).toBe(false)
    expect(isValidVacationPeriod('2026-02-29', '2026-03-01')).toBe(false)
    expect(isValidVacationPeriod('09/11/2026', '2026-11-12')).toBe(false)
  })

  it('allows an unknown end date for an absence but validates one when supplied', () => {
    expect(isValidAbsencePeriod('2026-11-09', '')).toBe(true)
    expect(isValidAbsencePeriod('2026-11-09', '2026-11-12')).toBe(true)
    expect(isValidAbsencePeriod('2026-11-12', '2026-11-09')).toBe(false)
    expect(isValidAbsencePeriod('2026-02-29', '')).toBe(false)
  })

  it('uses clear labels for every persisted decision', () => {
    expect(vacationRequestStatusLabels).toEqual({
      pending: 'Pendiente',
      approved: 'Aprobada',
      rejected: 'Rechazada',
    })
  })
})
