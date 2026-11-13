import { describe, expect, it } from 'vitest'

import { validateLedgerSearch } from './ledger-tabs'

describe('contabilidad tabs', () => {
  it.each(['resumen', 'apuntes', 'iva', 'calendario'])('supports direct links to %s', (tab) => {
    expect(validateLedgerSearch({ tab })).toEqual({ tab })
  })

  it('ignores unknown tab values', () => {
    expect(validateLedgerSearch({ tab: 'desconocido' })).toEqual({})
  })

  it('preserves a bounded search when opening accounting results from global search', () => {
    expect(validateLedgerSearch({ tab: 'apuntes', q: '  Materiales  ' })).toEqual({
      tab: 'apuntes',
      q: 'Materiales',
    })
    expect(validateLedgerSearch({ q: 'x'.repeat(200) }).q).toHaveLength(120)
    expect(validateLedgerSearch({ q: ['invalid'] })).toEqual({})
    expect(validateLedgerSearch({ q: '   ' })).toEqual({})
  })
})
