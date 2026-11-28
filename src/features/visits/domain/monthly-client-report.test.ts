import { describe, expect, it } from 'vitest'

import {
  monthlyClientReportRange,
  monthlyReportDateLabel,
  monthlyReportExtraQuantity,
  summarizeMonthlyClientReport,
  type MonthlyVisit,
} from './monthly-client-report'

describe('periodo del informe mensual', () => {
  it('usa el mes civil de Madrid y no el día UTC ni la zona del dispositivo', () => {
    expect(monthlyClientReportRange('2026-11')).toEqual({
      from: '2026-10-31T23:00:00.000Z',
      before: '2026-11-30T23:00:00.000Z',
    })
    expect(monthlyReportDateLabel('2026-10-31T23:15:00.000Z')).toContain('nov')
  })

  it('calcula cada borde con su offset, incluido el cambio de hora', () => {
    expect(monthlyClientReportRange('2026-03')).toEqual({
      from: '2026-02-28T23:00:00.000Z',
      before: '2026-03-31T22:00:00.000Z',
    })
    expect(monthlyClientReportRange('2026-10')).toEqual({
      from: '2026-09-30T22:00:00.000Z',
      before: '2026-10-31T23:00:00.000Z',
    })
    expect(monthlyClientReportRange('2026-12')?.before).toBe('2026-12-31T23:00:00.000Z')
  })

  it.each(['', '2026-00', '2026-13', '2026-1', '2026-01-01'])('rechaza %s como mes', (value) => {
    expect(monthlyClientReportRange(value)).toBeNull()
  })
})

it('cuenta sin sumar las canceladas u omitidas a las visitas pendientes', () => {
  const visits = (['completed', 'scheduled', 'in_progress', 'skipped', 'canceled'] as const).map(
    (status): MonthlyVisit => ({ id: status, title: '', centre: '', date: '', status }),
  )
  expect(summarizeMonthlyClientReport({ visits, extras: [] })).toEqual({
    completed: 1,
    pending: 2,
    canceledOrSkipped: 2,
    extras: 0,
  })
  expect(monthlyReportExtraQuantity({ quantity: 1.5, unit: 'h' })).toBe('1,5 h')
})
