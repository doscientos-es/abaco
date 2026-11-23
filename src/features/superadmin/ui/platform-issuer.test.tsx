import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { platformIssuerQuery, savePlatformIssuer } from '../application/platform-issuer'
import { issuerErrors, normalizeIssuer, type IssuerProfile } from '../domain/platform-issuer'
import { PlatformIssuer } from './platform-issuer'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/shared/lib/supabase/client', () => ({ createBrowserSupabaseClient: () => ({ rpc }) }))

const profile: IssuerProfile = {
  legal_name: ' Test SL ',
  tax_id: 'b12345678',
  street: 'Calle 1',
  postal_code: '08001',
  city: 'Barcelona',
  province: 'Barcelona',
  series: 'ab',
  corrective_series: 'r',
}
beforeEach(() => rpc.mockReset().mockResolvedValue({ error: null }))

describe('Doscientos invoice issuer', () => {
  it('normalizes and validates all required fiscal fields and separate series', () => {
    const normalized = normalizeIssuer(profile)
    expect(normalized).toMatchObject({ legal_name: 'Test SL', tax_id: 'B12345678', series: 'AB' })
    expect(issuerErrors(normalized)).toEqual({})
    expect(issuerErrors({ ...profile, series: 'r' }).corrective_series).toBeTruthy()
    expect(issuerErrors({ ...profile, postal_code: '8001' }).postal_code).toBeTruthy()
  })

  it('calls the authorized RPC with its revision and surfaces concurrent changes', async () => {
    const normalized = normalizeIssuer(profile)
    await savePlatformIssuer(2, normalized)
    expect(rpc).toHaveBeenCalledWith('superadmin_save_invoice_issuer', {
      p_revision: 2,
      p_profile: normalized,
    })
    rpc.mockResolvedValueOnce({ error: { code: '40001', message: 'Recarga antes de guardar.' } })
    await expect(savePlatformIssuer(2, normalized)).rejects.toThrow('Recarga antes de guardar.')
  })

  it('shows that saving settings does not activate the new issuer', () => {
    const client = new QueryClient()
    client.setQueryData(platformIssuerQuery('superadmin').queryKey, { revision: 0, profile: null })
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <PlatformIssuer userId="superadmin" />
      </QueryClientProvider>,
    )
    expect(html).toContain('Datos fiscales de Doscientos')
    expect(html).toContain('no la activa ni modifica Backoffice')
    expect(html).toContain('Serie rectificativa')
  })
})
