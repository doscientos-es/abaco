import { createFileRoute } from '@tanstack/react-router'

import { CatalogPage } from '@/features/catalog'

export const Route = createFileRoute('/catalogo')({
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === 'string' && search.q.trim() ? { q: search.q.slice(0, 120) } : {},
  component: CatalogPage,
})
