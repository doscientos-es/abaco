import { createFileRoute } from '@tanstack/react-router'

import { WelcomePage } from '@/features/onboarding'

export const Route = createFileRoute('/bienvenida')({ component: WelcomePage })