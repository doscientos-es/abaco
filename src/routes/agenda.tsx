import { createFileRoute, redirect } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { parseWorkSearch } from '@/features/work-orders'

export const Route = createFileRoute('/agenda')({
  beforeLoad: requirePermission('visits:read'),
  validateSearch: parseWorkSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => {
    throw redirect({
      to: '/trabajos',
      search: { ...deps, view: deps.view ?? 'calendar' },
      replace: true,
    })
  },
})
