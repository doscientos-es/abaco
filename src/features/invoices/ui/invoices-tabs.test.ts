import { describe, expect, it } from 'vitest'

import { validateInvoicesSearch } from './invoices-tabs'

describe('facturas tabs', () => {
  it.each(['emitidas', 'borradores', 'visitas'])('supports direct links to %s', (tab) => {
    expect(validateInvoicesSearch({ tab })).toEqual({ tab })
  })

  it('preserves the search query while rejecting unknown tabs', () => {
    expect(validateInvoicesSearch({ q: 'cliente', tab: 'desconocido' })).toEqual({ q: 'cliente' })
  })

  it('limits the search query length', () => {
    expect(validateInvoicesSearch({ q: 'x'.repeat(500) }).q).toHaveLength(120)
  })
})
