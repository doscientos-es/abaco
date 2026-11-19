import { describe, expect, it } from 'vitest'

import {
  defaultLedgerSummary,
  moveLedgerModule,
  resolveLedgerSummary,
  snapLedgerModuleWidth,
} from './ledger-summary-layout'

describe('accounting summary layout', () => {
  it('normalizes old or malformed modules without losing the order of valid choices', () => {
    const saved = {
      version: 1,
      modules: [
        { id: 'monthly', width: 11, chart: 'lines', months: 12 },
        { id: 'csv-payments', width: 2 },
        { id: 'categories', chart: 'table' },
        { id: 'monthly', chart: 'bars' },
        { id: 'obsolete' },
        null,
      ],
    }

    expect(resolveLedgerSummary(saved, true).modules).toEqual([
      { id: 'monthly', width: 12, chart: 'lines', months: 12 },
      { id: 'csv-payments', width: 6 },
      { id: 'categories', width: 6, chart: 'donut', months: 'all' },
    ])
    expect(resolveLedgerSummary(saved, false).modules.map(({ id }) => id)).toEqual([
      'monthly',
      'categories',
    ])
  })

  it('preserves intentionally empty layouts but restores defaults for unknown versions', () => {
    expect(resolveLedgerSummary({ version: 1, modules: [] }, false).modules).toEqual([])
    expect(resolveLedgerSummary({ version: 2, modules: [] }, false)).toEqual(defaultLedgerSummary())
  })

  it('moves a module to the new grid index without mutating the saved design', () => {
    const saved = defaultLedgerSummary()
    const original = saved.modules.map(({ id }) => id)
    const reordered = moveLedgerModule(saved, 'monthly', 1)

    expect(reordered.modules.map(({ id }) => id)).toEqual([
      'income',
      'monthly',
      'expenses',
      'result',
      'vat',
      'categories',
      'csv-book',
    ])
    expect(reordered.modules[1]).toEqual(saved.modules[4])
    expect(saved.modules.map(({ id }) => id)).toEqual(original)
    expect(moveLedgerModule(saved, 'monthly', -1)).toBe(saved)
    expect(moveLedgerModule(saved, 'removed', 0)).toBe(saved)
  })

  it('snaps pointer resizing to supported sizes and respects module limits', () => {
    expect(snapLedgerModuleWidth('monthly', 7.6)).toBe(8)
    expect(snapLedgerModuleWidth('monthly', 2)).toBe(6)
    expect(snapLedgerModuleWidth('income', 4.1)).toBe(4)
    expect(snapLedgerModuleWidth('income', 25)).toBe(12)
  })
})
