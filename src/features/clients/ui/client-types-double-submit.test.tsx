import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ClientTypesSection } from './client-types-section'

const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
  confirm: undefined as (() => void) | undefined,
  stateIndex: 0,
}))
vi.mock('react', async (load) => {
  const react = await load<typeof React>()
  return {
    ...react,
    useState: (initial: unknown) => {
      const value = mocks.stateIndex++ === 2 ? { id: 'type', label: 'Hotel' } : initial
      return react.useState(value)
    },
  }
})
vi.mock('@doscientos/ui', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  ConfirmDialog: ({ onConfirm }: { onConfirm: () => void }) => {
    mocks.confirm = onConfirm
    return null
  },
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ isSuccess: true, data: [] }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/shared/store/store', () => ({ useTenantData: () => ({ clients: [] }) }))
vi.mock('@/shared/ui/form', () => ({ TextField: () => null }))
vi.mock('../application/client-types', () => ({
  clientTypesQuery: () => ({ queryKey: ['client-types'] }),
  deleteClientType: mocks.remove,
}))

describe('client type deletion', () => {
  it('sends one deletion on rapid confirmation and unlocks after failure', async () => {
    let reject!: (reason: Error) => void
    mocks.remove.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail
      }),
    )
    mocks.remove.mockResolvedValue(undefined)
    mocks.stateIndex = 0
    renderToStaticMarkup(<ClientTypesSection tenantId="tenant" />)
    expect(mocks.confirm).toBeDefined()
    mocks.confirm?.()
    mocks.confirm?.()
    expect(mocks.remove).toHaveBeenCalledTimes(1)
    reject(new Error('failed'))
    await vi.waitFor(() => {
      mocks.confirm?.()
      expect(mocks.remove).toHaveBeenCalledTimes(2)
    })
  })
})
