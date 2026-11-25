import { describe, expect, it } from 'vitest'

import type { ClientInput } from './client-actions'
import { mergeClientAssistantValues } from './client-assistant'

const empty: ClientInput = {
  name: '',
  kind: '',
  taxId: '',
  phone: '',
  email: '',
  address: '',
  billingAddress: '',
  notes: '',
}

describe('streamed client fields', () => {
  it('updates fields as data arrives, but keeps a user edit even when the model changes it', () => {
    const first = mergeClientAssistantValues(empty, { name: 'Mar', email: null }, new Set())
    expect(first).toMatchObject({ name: 'Mar', email: '' })
    const edited = { ...first, name: 'Manuel' }
    const next = mergeClientAssistantValues(
      edited,
      { name: 'Marta', email: 'marta@example.test' },
      new Set(['name']),
    )
    expect(next).toMatchObject({ name: 'Manuel', email: 'marta@example.test' })
    expect(
      mergeClientAssistantValues(
        next,
        { name: 'Marta', email: 'marta@example.test' },
        new Set(['name']),
      ),
    ).toBe(next)
  })
})
