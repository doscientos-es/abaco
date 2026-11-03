import { Badge } from '@doscientos/ui'

import type { WorkOrderStatus } from '../application/work-order-actions'

export const workStatusLabels: Record<WorkOrderStatus, string> = {
  ready: 'Pendiente de preparar',
  scheduled: 'Programado',
  in_progress: 'En curso',
  completed: 'Completado',
  canceled: 'Cancelado',
}

const variants = {
  ready: 'neutral',
  scheduled: 'info',
  in_progress: 'info',
  completed: 'success',
  canceled: 'danger',
} as const

export function WorkStatusBadge({ status }: { status: WorkOrderStatus }) {
  return <Badge variant={variants[status]}>{workStatusLabels[status]}</Badge>
}