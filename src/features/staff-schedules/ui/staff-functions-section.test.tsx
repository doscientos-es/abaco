import type * as ReactQuery from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StaffFunctionsSection } from './staff-functions-section'

const mocks = vi.hoisted(() => ({
  schedules: {
    isSuccess: true,
    isError: false,
    data: [
      { userId: 'ana', functionIds: ['electric', 'water'] },
      { userId: 'bea', functionIds: ['electric'] },
      { userId: 'former', functionIds: ['water'] },
    ],
  },
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQuery>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === 'team')
      return { isSuccess: true, data: [{ userId: 'ana' }, { userId: 'bea' }] }
    if (queryKey[0] === 'staff-schedules') return mocks.schedules
    return {
      isSuccess: true,
      data: [
        { id: 'electric', name: 'Electricidad' },
        { id: 'water', name: 'Fontanería' },
        { id: 'other', name: 'Otra' },
      ],
    }
  },
}))

describe('StaffFunctionsSection', () => {
  beforeEach(() => {
    mocks.schedules.isSuccess = true
    mocks.schedules.isError = false
  })
  it('removes the outer card and visible title only when embedded', () => {
    const embedded = renderToStaticMarkup(<StaffFunctionsSection tenantId="company" embedded />)
    expect(embedded).toContain(
      '<section class="space-y-4" aria-labelledby="staff-functions-heading">',
    )
    expect(embedded).toContain('class="sr-only">Funciones del equipo</h2>')
    expect(embedded).toContain('Electricidad')
    expect(embedded).toContain('Nueva función')
    expect(embedded).toContain('Asignar trabajadores a Electricidad')

    const standalone = renderToStaticMarkup(<StaffFunctionsSection tenantId="company" />)
    expect(standalone).toContain('border-border bg-card space-y-4 rounded-lg border p-5')
    expect(standalone).toContain('class="font-semibold">Funciones del equipo</h2>')
  })

  it('counts assigned current workers per function and labels the action', () => {
    const html = renderToStaticMarkup(<StaffFunctionsSection tenantId="company" embedded />)
    expect(html).toContain('2 trabajadores asignados')
    expect(html).toContain('1 trabajador asignado')
    expect(html).toContain('0 trabajadores asignados')
    expect(html).toContain('>Asignar</button>')
  })

  it('does not show misleading zero counts while loading or after an error', () => {
    mocks.schedules.isSuccess = false
    expect(renderToStaticMarkup(<StaffFunctionsSection tenantId="company" />)).toContain(
      'Cargando asignaciones…',
    )
    mocks.schedules.isError = true
    const html = renderToStaticMarkup(<StaffFunctionsSection tenantId="company" />)
    expect(html).toContain('Recuento no disponible')
    expect(html).not.toContain('0 trabajadores asignados')
  })
})
