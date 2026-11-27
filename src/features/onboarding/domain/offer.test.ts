import { describe, expect, it } from 'vitest'

import { onboardingDestination } from '../application/company-onboarding'
import { onboardingOffer, publicBookingUrl } from './offer'

describe('onboarding selection', () => {
  const catalog = [
    {
      plan: 'standard' as const,
      seats: 1,
      monthly_cents: 3480,
      yearly_cents: 34800,
      seat_monthly_cents: 800,
      vat_percent: 21,
    },
  ]
  const modules = [{ code: 'ai' as const, monthly_cents: 375, yearly_cents: 4500 }]
  it('uses the established annual rate and charges optional modules only once', () => {
    const quote = onboardingOffer(catalog, modules, ['ai', 'ai'], 3, 'year')
    expect(quote?.baseCents).toBe(34800)
    expect(quote?.seatsCents).toBe(19200)
    expect(quote?.terms).toMatchObject({
      net_cents: 58500,
      amount_cents: 70785,
      module_net_cents: 4500,
    })
  })
  it('does not allow a legacy plan or an unavailable module', () => {
    expect(onboardingOffer(catalog, modules, ['supplier_logistics'], 1, 'month')).toBeNull()
    expect(onboardingOffer(catalog, modules, ['mcp'], 1, 'month')).toBeNull()
    expect(onboardingOffer(catalog, modules, [], 201, 'month')).toBeNull()
  })
  it('never trusts a browser return to decide whether to enter the workspace', () => {
    for (const stage of ['selection', 'pending', 'booking', 'billing_issue'] as const) {
      expect(onboardingDestination(stage, '/trabajadores')).toBe('/bienvenida')
      expect(onboardingDestination(stage, '/bienvenida')).toBeNull()
    }
    expect(onboardingDestination('complete', '/bienvenida')).toBe('/')
    expect(onboardingDestination(undefined, '/')).toBeNull()
    expect(onboardingDestination('booking', '/nueva-contrasena')).toBeNull()
    expect(publicBookingUrl('https://cal.eu/doscientos/onboarding')).toBe(
      'https://cal.eu/doscientos/onboarding',
    )
    expect(publicBookingUrl('https://cal.eu.example.test/doscientos/onboarding')).toBeNull()
  })

  it('prefers the Menos Lios booking URL while supporting the existing configuration', () => {
    const oldUrl = 'https://cal.com/doscientos/old'
    const newUrl = 'https://cal.com/doscientos/new'
    expect(publicBookingUrl(newUrl, oldUrl)).toBe(newUrl)
    expect(publicBookingUrl(undefined, oldUrl)).toBe(oldUrl)
    expect(publicBookingUrl('', oldUrl)).toBe(oldUrl)
    expect(publicBookingUrl('https://invalid.example/new', oldUrl)).toBeNull()
  })
})
