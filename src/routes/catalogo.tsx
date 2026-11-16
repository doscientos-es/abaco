import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { CatalogPage } from '@/features/catalog'

export const Route = createFileRoute('/catalogo')({
  beforeLoad: requirePermission('catalog:read'),
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === 'string' && search.q.trim() ? { q: search.q.slice(0, 120) } : {},
  component: CatalogPage,
})
