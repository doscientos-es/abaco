import { describe, expect, it } from 'vitest'

import { validateLedgerSearch } from './ledger-tabs'

describe('contabilidad tabs', () => {
  it.each(['resumen', 'apuntes', 'iva', 'calendario'])('supports direct links to %s', (tab) => {
    expect(validateLedgerSearch({ tab })).toEqual({ tab })
  })

  it('ignores unknown tab values', () => {
    expect(validateLedgerSearch({ tab: 'desconocido' })).toEqual({})
  })
})
