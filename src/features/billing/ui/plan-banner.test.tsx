import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Subscription } from '../application/billing-actions'
import { PlanBanner } from './plan-banner'

const { query, session, link } = vi.hoisted(() => ({
  query: vi.fn(),
  session: vi.fn(),
  link: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({ useQuery: query }))
vi.mock('@tanstack/react-router', () => ({ Link: link }))
vi.mock('@/features/auth', () => ({ useSession: session }))
vi.mock('../application/billing-actions', () => ({
  subscriptionQuery: (tenantId: string) => ({ queryKey: ['subscription', tenantId] }),
}))

const subscription: Subscription = {
  plan: 'trial',
  status: 'trialing',
  isComplimentary: false,
  trialEndsAt: new Date('2026-11-01T12:00:00Z'),
  interval: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  nextPlan: null,
  nextInterval: null,
  canWrite: false,
  trialDaysLeft: 0,
}

describe('PlanBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    session.mockReturnValue({ tenantId: 'tenant-1', role: 'admin' })
    query.mockReturnValue({ data: subscription })
    link.mockImplementation(
      ({
        children,
        to,
        search,
      }: {
        children: ReactNode
        to: string
        search?: { tab?: string }
      }) => <a href={`${to}?tab=${search?.tab ?? ''}`}>{children}</a>,
    )
  })

  it('shows a clear read-only alert and links admins directly to the plan tab', () => {
    const html = renderToStaticMarkup(<PlanBanner />)

    expect(html).toContain('role="alert"')
    expect(html).toContain('Tu prueba ha terminado')
    expect(html).toContain('Puedes ver tus datos, pero no editarlos.')
    expect(html).toContain('plan-banner-expired-top')
    expect(html).toContain('href="/ajustes?tab=plan"')
    expect(link.mock.calls[0]?.[0]).toMatchObject({ to: '/ajustes', search: { tab: 'plan' } })
  })

  it('offers a compact activation action in the desktop sidebar', () => {
    const html = renderToStaticMarkup(<PlanBanner placement="sidebar" />)

    expect(html).toContain('Prueba finalizada')
    expect(html).toContain('Activa un plan para volver a editar tus datos.')
    expect(html).toContain('Activar plan')
    expect(html).toContain('href="/ajustes?tab=plan"')
  })

  it('asks users to contact an admin instead of offering the plan link', () => {
    session.mockReturnValue({ tenantId: 'tenant-1', role: 'user' })

    const html = renderToStaticMarkup(<PlanBanner />)

    expect(html).toContain('Pide a un administrador que elija un plan.')
    expect(link).not.toHaveBeenCalled()
  })

  it('never shows billing alerts for courtesy access', () => {
    query.mockReturnValue({ data: { ...subscription, isComplimentary: true, status: 'past_due' } })
    expect(renderToStaticMarkup(<PlanBanner />)).toBe('')
  })
})
