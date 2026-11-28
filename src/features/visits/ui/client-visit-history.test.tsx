import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { can } from '@/features/auth/domain/permissions'

const session = vi.hoisted(() => ({ role: 'admin', tenantId: 'tenant-a', userId: 'admin-a' }))
vi.mock('@/features/auth', () => ({ can, useSession: () => session }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [], isSuccess: true }) }))
vi.mock('./paper-visit-panel', () => ({ PaperVisitPanel: () => null }))

import { ClientVisitHistory } from './client-visit-history'

const render = () =>
  renderToStaticMarkup(
    <ClientVisitHistory
      tenantId="tenant-a"
      clientId="client-a"
      clientName="Cliente ficticio"
      locations={[]}
    />,
  )

describe('informe en historial de un cliente', () => {
  it('lo ofrece a la oficina de la empresa activa, pero no genera todavía la vista previa', () => {
    Object.assign(session, { role: 'admin', tenantId: 'tenant-a' })
    expect(render()).toContain('Informe mensual de servicios')
    expect(render()).not.toContain('Descargar informe en PDF')
  })

  it.each([
    ['user', 'tenant-a'],
    ['admin', 'tenant-b'],
  ])('no muestra el informe para %s en %s', (role, tenantId) => {
    Object.assign(session, { role, tenantId })
    expect(render()).not.toContain('Informe mensual de servicios')
  })
})
