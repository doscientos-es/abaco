import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/clientes')({ component: Outlet })
