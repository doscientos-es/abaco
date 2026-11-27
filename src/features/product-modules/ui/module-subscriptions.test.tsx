import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'

import { ModuleSubscriptions } from './module-subscriptions'

vi.mock('@doscientos/ui', () => ({
  Alert: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertAction: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Button: ({ children, ...props }: { children: ReactNode; 'aria-label'?: string }) => (
    <button aria-label={props['aria-label']}>{children}</button>
  ),
  FormFeedback: () => null,
  Spinner: () => null,
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    isSuccess: true,
    data:
      queryKey[0] === 'catalog'
        ? [{ code: 'workers', monthly_cents: 900, yearly_cents: 9000 }]
        : [],
  }),
  useMutation: () => ({ isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('../application/module-queries', () => ({
  moduleCatalogQuery: { queryKey: ['catalog'] },
  moduleSubscriptionsQuery: () => ({ queryKey: ['subscriptions'] }),
  scheduleModule: vi.fn(),
  setTenantModuleGift: vi.fn(),
  tenantModulesQuery: () => ({ queryKey: ['modules'] }),
}))

it('lets a trial customer preselect a formerly included module for the new paid offer', () => {
  const html = renderToStaticMarkup(
    <ModuleSubscriptions
      tenantId="company"
      active={false}
      plan="trial"
      allowIncludedSelection
      onChanged={() => {}}
    />,
  )
  expect(html).toContain('Incluido en el plan')
  expect(html).toContain('Contratar para Menos Líos: Trabajadores')
  expect(html).toMatch(/\+9,00\s*€\/mes/)
})

it('retains the old read-only included-module treatment when no migration is offered', () => {
  const html = renderToStaticMarkup(
    <ModuleSubscriptions tenantId="company" active plan="team" onChanged={() => {}} />,
  )
  expect(html).toContain('Incluido en el plan')
  expect(html).not.toContain('Contratar para Menos Líos')
})
