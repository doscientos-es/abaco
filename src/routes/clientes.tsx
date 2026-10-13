import { createFileRoute } from '@tanstack/react-router'

import { ClientsPage } from '@/features/clients'

export const Route = createFileRoute('/clientes')({ component: ClientsPage })
