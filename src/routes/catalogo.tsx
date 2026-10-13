import { createFileRoute } from '@tanstack/react-router'

import { CatalogPage } from '@/features/catalog'

export const Route = createFileRoute('/catalogo')({ component: CatalogPage })
