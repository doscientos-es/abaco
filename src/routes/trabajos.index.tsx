import { createFileRoute, redirect } from '@tanstack/react-router'

import { WorkOrdersPage } from '@/features/work-orders'

export const Route = createFileRoute('/trabajos/')({
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: ({ deps }) => {
    if (deps.tab === 'contratados') {
      throw redirect({ to: '/contratos', search: { tab: 'trabajos' }, replace: true })
    }
  },
  component: WorkOrdersPage,
})
