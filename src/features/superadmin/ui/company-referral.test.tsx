import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  platformCompanyReferralQuery,
  setCompanyReferral,
  type CompanyReferral,
} from '../application/superadmin-queries'
import { CompanyReferralSection } from './company-referral'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/shared/lib/supabase/client', () => ({ createBrowserSupabaseClient: () => ({ rpc }) }))

describe('company referral administration', () => {
  beforeEach(() => rpc.mockReset())

  it('shows the current attribution and that only superadministration can change it', () => {
    const client = new QueryClient()
    const referral: CompanyReferral = {
      referrer_id: 'referrer',
      referrer_name: 'Taller Norte',
    }
    client.setQueryData<CompanyReferral | null>(
      platformCompanyReferralQuery('tenant').queryKey,
      referral,
    )
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <CompanyReferralSection tenantId="tenant" />
      </QueryClientProvider>,
    )
    expect(html).toContain('Taller Norte')
    expect(html).toContain('Solo superadministración puede corregir')
    expect(html).toContain('Modificar recomendación')
    client.clear()
  })

  it('sends the expected attribution and reports concurrent changes', async () => {
    rpc.mockResolvedValueOnce({ error: null })
    await setCompanyReferral('tenant', 'new', 'previous')
    expect(rpc).toHaveBeenCalledWith('superadmin_set_company_referral', {
      p_tenant: 'tenant',
      p_referrer: 'new',
      p_expected: 'previous',
    })
    rpc.mockResolvedValueOnce({
      error: { code: '40001', message: 'La recomendación ha cambiado.' },
    })
    await expect(setCompanyReferral('tenant', null, 'previous')).rejects.toThrow(
      'La recomendación ha cambiado.',
    )
  })
})
