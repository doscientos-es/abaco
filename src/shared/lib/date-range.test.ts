import { describe, expect, it } from 'vitest'

import { dateRangePresets, selectRangeDay } from './date-range'

describe('rangos de fechas locales', () => {
  it('calcula atajos inclusivos al cruzar el año y el cambio horario', () => {
    const presets = dateRangePresets('2026-12-31')
    expect(presets.find((preset) => preset.label === 'La semana que viene')).toEqual({
      label: 'La semana que viene',
      start: '2027-01-04',
      end: '2027-01-10',
    })
    expect(dateRangePresets('2024-02-29').find((preset) => preset.label === 'Este mes')).toEqual({
      label: 'Este mes',
      start: '2024-02-01',
      end: '2024-02-29',
    })
    expect(dateRangePresets('2026-03-30').find((preset) => preset.label === 'Ayer')?.start).toBe('2026-03-29')
  })

  it('selecciona un día, un rango invertido y reinicia tras un rango completo', () => {
    expect(selectRangeDay('', '', '2026-11-10')).toEqual({ start: '2026-11-10', end: '' })
    expect(selectRangeDay('2026-11-10', '', '2026-11-10')).toEqual({ start: '2026-11-10', end: '2026-11-10' })
    expect(selectRangeDay('2026-11-10', '', '2026-11-08')).toEqual({ start: '2026-11-08', end: '2026-11-10' })
    expect(selectRangeDay('2026-11-08', '2026-11-10', '2026-12-01')).toEqual({ start: '2026-12-01', end: '' })
    expect(selectRangeDay('', '2026-11-10', '2026-12-01')).toEqual({ start: '2026-12-01', end: '' })
  })
})