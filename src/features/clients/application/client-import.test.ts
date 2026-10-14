import { describe, expect, it } from 'vitest'

import { clientImportSchema } from './client-import'

describe('client import form limits', () => {
  it('accepts a one-character name and the maximum name length', () => {
    expect(clientImportSchema.parse({ Nombre: 'A' }).ok).toBe(true)
    expect(clientImportSchema.parse({ Nombre: 'A'.repeat(160) }).ok).toBe(true)
  })

  it('rejects names longer than the client form allows', () => {
    expect(clientImportSchema.parse({ Nombre: 'A'.repeat(161) })).toMatchObject({ ok: false })
  })
})
