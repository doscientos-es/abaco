import { describe, expect, it } from 'vitest'

import {
  availableLedgerModules,
  defaultLedgerSummary,
  resolveLedgerSummary,
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

  it('restores the selected radial chart and its period', () => {
    const category = { id: 'categories', width: 6, chart: 'radial', months: 12 }
    expect(resolveLedgerSummary({ version: 1, modules: [category] }, false).modules).toEqual([
      category,
    ])
  })

  it('makes imports available without changing saved dashboards or exposing restricted exports', () => {
    expect(defaultLedgerSummary().modules.map(({ id }) => id)).toContain('import-entries')
    expect(
      resolveLedgerSummary({ version: 1, modules: [{ id: 'csv-book' }] }, false).modules,
    ).toEqual([{ id: 'csv-book', width: 6 }])
    expect(availableLedgerModules(false)).toContain('import-entries')
    expect(availableLedgerModules(false)).not.toContain('csv-clients')
    expect(availableLedgerModules(true)).toContain('csv-clients')
  })
})
