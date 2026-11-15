import { describe, expect, it } from 'vitest'

import { estimateSectionsSchema } from './estimate-document'
import { selectServicePeriodicity, serviceFrequencySelection } from './service-periodicity'

const row = {
  id: '86000000-0000-4000-8000-000000000001',
  task: 'Portal',
  frequency: '',
  notes: 'Sin lejía',
}
const section = {
  id: '86000000-0000-4000-8000-000000000002',
  type: 'work_table',
  title: 'Servicios',
  pageBreakBefore: false,
}

describe('quoted service periodicities', () => {
  it('selects exactly one periodicity without changing task details', () => {
    const monthly = selectServicePeriodicity(row, 'monthly')
    expect(monthly).toEqual({ ...row, periodicities: ['monthly'] })
    expect(selectServicePeriodicity(monthly, 'daily')).toEqual({ ...row, periodicities: ['daily'] })
    expect(
      selectServicePeriodicity({ ...row, periodicities: ['daily', 'monthly'] }, 'annual'),
    ).toEqual({ ...row, periodicities: ['annual'] })
    expect(row).not.toHaveProperty('periodicities')
  })

  it.each([
    [' SEMANAL ', 'weekly'],
    ['Diaria', 'daily'],
    ['Dos veces al año', 'semiannual'],
    ['Dos veces a la semana', 'twice_weekly'],
    ['Anual', 'annual'],
  ])('recognizes the exact historical label %s without mutating saved rows', (frequency, value) => {
    expect(serviceFrequencySelection({ ...row, frequency })).toEqual({
      periodicities: [value],
      other: '',
    })
  })

  it.each(['Semanal en verano; mensual en invierno', '__proto__', 'Según necesidad'])(
    'keeps nonstandard historical text %s when checking a new column',
    (frequency) => {
      expect(selectServicePeriodicity({ ...row, frequency }, 'annual')).toEqual({
        ...row,
        frequency,
        periodicities: ['annual'],
      })
    },
  )

  it('does not reinterpret an explicit empty selection or custom frequency', () => {
    expect(serviceFrequencySelection({ frequency: 'Semanal', periodicities: [] })).toEqual({
      periodicities: [],
      other: 'Semanal',
    })
  })

  it('round-trips structured checks alongside historical rows', () => {
    const rows = [
      row,
      { ...row, id: '86000000-0000-4000-8000-000000000003', periodicities: ['daily', 'monthly'] },
    ]
    expect(estimateSectionsSchema.parse([{ ...section, rows }])).toEqual([{ ...section, rows }])
  })

  it.each([
    { periodicities: ['weekly', 'weekly'] },
    { periodicities: ['fortnightly'] },
    { periodicities: ['daily', 1] },
    { periodicities: null },
    { periodicities: 'daily' },
  ])('rejects malformed periodicities $periodicities', ({ periodicities }) => {
    expect(
      estimateSectionsSchema.safeParse([{ ...section, rows: [{ ...row, periodicities }] }]).success,
    ).toBe(false)
  })
})
