import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@doscientos/ui', () => ({
  Button: ({ children, isDisabled, ...props }: { children: ReactNode; isDisabled?: boolean }) => (
    <button disabled={isDisabled} {...props}>
      {children}
    </button>
  ),
  ConfirmDialog: () => null,
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    isSuccess: true,
    data: [
      { id: 'a', value: 'hotel', label: 'Hotel', position: 1 },
      { id: 'b', value: 'other', label: 'Otro', position: 2 },
    ],
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/shared/store/store', () => ({
  useTenantData: () => ({ clients: [{ kind: 'hotel', archivedAt: '2026-01-01' }] }),
}))
vi.mock('@/shared/ui/form', () => ({ TextField: () => null }))
vi.mock('../application/client-types', () => ({
  clientTypesQuery: () => ({ queryKey: ['client-types', 'tenant'] }),
}))

import { ClientTypesSection } from './client-types-section'

describe('configurable client types', () => {
  it('prevents deletion of a type used by an archived client, but allows unused types', () => {
    const html = renderToStaticMarkup(<ClientTypesSection tenantId="tenant" />)
    expect(html).toContain('En uso por 1 cliente')
    expect(html).toMatch(/<button disabled=""[^>]*aria-label="Eliminar Hotel"/)
    expect(html).toMatch(/<button variant="outline" aria-label="Eliminar Otro"/)
  })
})
