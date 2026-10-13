import { createFileRoute, Outlet } from '@tanstack/react-router'

/** Layout for `/facturas` (list) and `/facturas/$invoiceId` (detail). */
export const Route = createFileRoute('/facturas')({ component: Outlet })
