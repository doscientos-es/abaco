import { describe, expect, it } from 'vitest'

import { ledgerImportSchema } from './ledger-import'

const row = (Concepto: string) => ({ Fecha: '15/03/2026', Tipo: 'Gasto', Concepto, Total: '12,50' })

describe('ledger import form limits', () => {
  it('accepts the maximum concept length', () => {
    expect(ledgerImportSchema.parse(row('A'.repeat(200))).ok).toBe(true)
  })

  it('rejects overlong concepts and amounts outside the form range', () => {
    expect(ledgerImportSchema.parse(row('A'.repeat(201))).ok).toBe(false)
    expect(ledgerImportSchema.parse({ ...row('Compra'), Total: '999999999999999999999' }).ok).toBe(
      false,
    )
    expect(ledgerImportSchema.parse({ ...row('Compra'), Total: '1000000000' }).ok).toBe(false)
  })
})
