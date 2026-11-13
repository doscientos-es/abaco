import type * as ReactQuery from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { StaffFunctionsSection } from './staff-functions-section'

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQuery>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({ isSuccess: true, data: [{ id: 'electric', name: 'Electricidad' }] }),
}))

describe('StaffFunctionsSection', () => {
  it('removes the outer card and visible title only when embedded', () => {
    const embedded = renderToStaticMarkup(<StaffFunctionsSection tenantId="company" embedded />)
    expect(embedded).toContain(
      '<section class="space-y-4" aria-labelledby="staff-functions-heading">',
    )
    expect(embedded).toContain('class="sr-only">Funciones del equipo</h2>')
    expect(embedded).toContain('Electricidad')
    expect(embedded).toContain('Nueva función')

    const standalone = renderToStaticMarkup(<StaffFunctionsSection tenantId="company" />)
    expect(standalone).toContain('border-border bg-card space-y-4 rounded-lg border p-5')
    expect(standalone).toContain('class="font-semibold">Funciones del equipo</h2>')
  })
})
