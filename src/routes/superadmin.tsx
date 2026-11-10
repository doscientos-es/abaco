import { createFileRoute } from '@tanstack/react-router'

import { SuperadminPage } from '@/features/superadmin'

export const Route = createFileRoute('/superadmin')({ component: SuperadminPage })
