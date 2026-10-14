import { createFileRoute } from '@tanstack/react-router'

import { WelcomePage } from '@/features/auth'

export const Route = createFileRoute('/bienvenida')({ component: WelcomePage })