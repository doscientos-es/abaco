import {
  loadWorkStructure,
  type WorkStructure,
  type WorkTask,
} from '@/features/work-orders/infrastructure/work-structure-repository'

export type MyDayTask = WorkTask & {
  phaseTitle: string
  checklist: { id: string; label: string; done: boolean }[]
}

export type MyDayWork = {
  visitId: string
  tasks: MyDayTask[]
}

export function mapWorkStructureToMyDayTasks(structure: WorkStructure): MyDayTask[] {
  const phaseTitles = new Map(structure.phases.map((phase) => [phase.id, phase.title]))
  const checklistByTask = new Map<string, MyDayTask['checklist']>()
  for (const item of structure.items) {
    const items = checklistByTask.get(item.task_id) ?? []
    items.push({ id: item.id, label: item.label, done: item.done })
    checklistByTask.set(item.task_id, items)
  }
  return structure.tasks.map((task) => ({
    ...task,
    phaseTitle: phaseTitles.get(task.phase_id) ?? 'Tareas del servicio',
    checklist: checklistByTask.get(task.id) ?? [],
  }))
}

/** Resolve work orders only through visits already returned by the authorized day query. */
export async function listMyDayTasks(
  tenantId: string,
  visits: { id: string; work_order_id?: string | null }[],
): Promise<MyDayWork[]> {
  if (visits.length === 0) return []

  const workOrderIds = [
    ...new Set(visits.flatMap((visit) => (visit.work_order_id ? [visit.work_order_id] : []))),
  ]
  const structures = await Promise.all(
    workOrderIds.map(
      async (workOrderId) => [workOrderId, await loadWorkStructure(tenantId, workOrderId)] as const,
    ),
  )
  const byWorkOrder = new Map(structures)
  return visits.map((visit) => {
    const structure = visit.work_order_id ? byWorkOrder.get(visit.work_order_id) : undefined
    return {
      visitId: visit.id,
      tasks: structure ? mapWorkStructureToMyDayTasks(structure) : [],
    }
  })
}
