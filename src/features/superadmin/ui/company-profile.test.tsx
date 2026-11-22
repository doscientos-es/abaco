import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  platformCompanyProfileQuery,
  updateCompanyProfile,
} from '../application/superadmin-queries'
import type { CompanyProfile } from '../domain/company-profile'
import { CompanyProfileSection } from './company-profile'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/shared/lib/supabase/client', () => ({ createBrowserSupabaseClient: () => ({ rpc }) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, search }: { children: ReactNode; search: Record<string, string> }) => (
    <a href={`/superadmin?${new URLSearchParams(search)}`}>{children}</a>
  ),
}))

const tenantId = 'empresa'
const profile: CompanyProfile = {
  name: 'Taller Norte',
  legal_name: 'Taller Norte SL',
  tax_id: 'B12345678',
  email: 'hola@example.test',
  phone: '',
  address: '',
  postal_code: '',
  city: '',
  website: '',
  updated_at: '2026-11-22T10:00:00.123456+00:00',
}
let client: QueryClient
beforeEach(() => {
  client = new QueryClient()
  client.setQueryData(platformCompanyProfileQuery(tenantId).queryKey, profile)
  rpc.mockReset().mockResolvedValue({ error: null })
})

function render(editing = false) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <CompanyProfileSection
        tenantId={tenantId}
        search={{ empresa: tenantId, seccion: 'datos', ...(editing && { edicion: 'empresa' }) }}
      />
    </QueryClientProvider>,
  )
}

describe('platform company profile', () => {
  it('shows useful details and routes to explicit editing and subscription', () => {
    const html = render()
    expect(html).toContain('Taller Norte SL')
    expect(html).toContain('hola@example.test')
    expect(html).toContain('Sin indicar')
    expect(html).toContain('seccion=datos&amp;edicion=empresa')
    expect(html).toContain('Ir a suscripción y precio')
    expect(html).not.toContain('<input')
  })

  it('renders editable fields without exposing bank details or enabling an unchanged save', () => {
    const html = render(true)
    expect(html).toContain('value="Taller Norte"')
    expect(html).toContain('Nombre comercial')
    expect(html).toContain('Volver a los datos')
    expect(html).not.toContain('IBAN')
    expect(html).toMatch(/<button\b[^>]*\bdisabled=""[^>]*>Guardar datos<\/button>/)
  })

  it('sends the exact revision and propagates concurrency errors', async () => {
    const { updated_at, ...values } = profile
    await updateCompanyProfile(tenantId, updated_at, values)
    expect(rpc).toHaveBeenCalledWith('superadmin_update_company_profile', {
      p_tenant: tenantId,
      p_expected_updated_at: updated_at,
      p_profile: values,
    })
    rpc.mockResolvedValueOnce({ error: { code: '40001', message: 'La empresa ha cambiado.' } })
    await expect(updateCompanyProfile(tenantId, updated_at, values)).rejects.toThrow(
      'La empresa ha cambiado.',
    )
  })
})
