import { createFileRoute } from '@tanstack/react-router'

import { GoogleCallbackPage } from '@/features/auth'

export const Route = createFileRoute('/acceso-google')({ component: GoogleCallbackPage })
