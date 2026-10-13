import { createFileRoute } from '@tanstack/react-router'

import { RecoverPage } from '@/features/auth'

export const Route = createFileRoute('/recuperar')({ component: RecoverPage })
