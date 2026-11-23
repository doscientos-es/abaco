import {
  createServiceVisit,
  transitionServiceVisit,
} from '@/features/visits/application/visit-actions'

import { workDayChanges, type WorkDayVisit } from '../domain/work-days'
import type { WorkOrder } from './work-order-actions'

export { listWorkDayVisits } from '../infrastructure/work-days-repository'
export type { WorkDayVisit } from '../domain/work-days'

export async function saveWorkDays(
  input: {
    tenantId: string
    order: WorkOrder
    visits: WorkDayVisit[]
    selectedDays: string[]
    localTime: string
    timezone: string
    durationMinutes: number
    assignedUserId: string | null
  },
  operations: Map<string, string>,
) {
  const changes = workDayChanges(input.visits, input.selectedDays)
  async function run(key: string, action: (operationId: string) => Promise<unknown>) {
    const id = operations.get(key) ?? crypto.randomUUID()
    operations.set(key, id)
    await action(id)
    operations.delete(key)
  }
  for (const day of changes.add) {
    const payload = {
      tenantId: input.tenantId,
      clientId: input.order.client_id,
      locationId: input.order.location_id,
      workOrderId: input.order.id,
      title: input.order.title,
      assignedUserId: input.assignedUserId,
      localStart: `${day}T${input.localTime}`,
      timezone: input.timezone,
      durationMinutes: input.durationMinutes,
      priority: 'normal' as const,
      notes: '',
    }
    await run(JSON.stringify(['create', payload]), (operationId) =>
      createServiceVisit({ ...payload, operationId }),
    )
  }
  for (const visit of changes.remove) {
    const payload = {
      tenantId: input.tenantId,
      visitId: visit.id,
      expectedUpdatedAt: visit.updated_at,
      nextStatus: 'canceled' as const,
      reason: 'Día retirado de la planificación de la obra',
    }
    await run(JSON.stringify(['cancel', payload]), (operationId) =>
      transitionServiceVisit({ ...payload, operationId }),
    )
  }
}
