import { createFileRoute } from '@tanstack/react-router'

import { PublicAppointmentPage } from '@/features/visits'

export const Route = createFileRoute('/cita')({ component: PublicAppointmentPage })
