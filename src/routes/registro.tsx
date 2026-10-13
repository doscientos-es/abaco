import { createFileRoute } from '@tanstack/react-router'

import { RegisterPage } from '@/features/auth'

export const Route = createFileRoute('/registro')({ component: RegisterPage })
