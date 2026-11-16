import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { SuppliersPage } from '@/features/catalog'

export const Route = createFileRoute('/proveedores')({
  beforeLoad: requirePermission('catalog:read'),
  component: SuppliersPage,
})
