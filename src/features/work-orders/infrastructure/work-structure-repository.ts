import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type WorkPhase = {
  id: string
  position: number
  title: string
}

export type WorkTask = {
  id: string
  phase_id: string
  position: number
  title: string
  notes: string
  status: 'pending' | 'in_progress' | 'done' | 'skipped'
  updated_at: string
}

export type WorkChecklistItem = {
  id: string
  task_id: string
  position: number
  label: string
  done: boolean
  updated_at: string
}

export type WorkStructure = {
  phases: WorkPhase[]
  tasks: WorkTask[]
  items: WorkChecklistItem[]
}

export type WorkStructureAction =
  | 'phase_added'
  | 'task_added'
  | 'task_status_changed'
  | 'checklist_item_added'
  | 'checklist_item_changed'

/** Every query is scoped to one work order; structure contains no financial fields. */
export async function loadWorkStructure(
  tenantId: string,
  workOrderId: string,
): Promise<WorkStructure> {
  const db = createBrowserSupabaseClient()
  const [phasesResult, tasksResult, itemsResult] = await Promise.all([
    db
      .from('work_order_phases')
      .select('id,position,title')
      .eq('tenant_id', tenantId)
      .eq('work_order_id', workOrderId)
      .order('position'),
    db
      .from('work_order_tasks')
      .select('id,phase_id,position,title,notes,status,updated_at')
      .eq('tenant_id', tenantId)
      .eq('work_order_id', workOrderId)
      .order('position'),
    db
      .from('work_task_checklist_items')
      .select('id,task_id,position,label,done,updated_at')
      .eq('tenant_id', tenantId)
      .eq('work_order_id', workOrderId)
      .order('position'),
  ])
  if (phasesResult.error) throw new Error(phasesResult.error.message)
  if (tasksResult.error) throw new Error(tasksResult.error.message)
  if (itemsResult.error) throw new Error(itemsResult.error.message)
  return {
    phases: (phasesResult.data ?? []) as WorkPhase[],
    tasks: (tasksResult.data ?? []) as WorkTask[],
    items: (itemsResult.data ?? []) as WorkChecklistItem[],
  }
}

export async function applyWorkStructureCommand(
  tenantId: string,
  workOrderId: string,
  action: WorkStructureAction,
  payload: Record<string, unknown>,
  operationId: string,
): Promise<void> {
  const { error } = await createBrowserSupabaseClient().rpc('apply_work_structure_command', {
    p_tenant_id: tenantId,
    p_work_order_id: workOrderId,
    p_action: action,
    p_payload: payload,
    p_operation_id: operationId,
  })
  if (error) throw new Error(error.message)
}
