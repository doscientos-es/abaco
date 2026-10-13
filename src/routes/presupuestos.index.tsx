import { createFileRoute } from '@tanstack/react-router'

import { EstimateListPage } from '@/features/estimates'

export const Route = createFileRoute('/presupuestos/')({ component: EstimateListPage })
