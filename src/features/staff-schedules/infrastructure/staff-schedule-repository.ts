import { queryOptions } from '@tanstack/react-query'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import { fetchAllPages } from '@/shared/lib/supabase/fetch-all-pages'

import type {
  StaffAbsence,
  StaffFunction,
  StaffSchedule,
  StaffSlot,
} from '../domain/staff-schedule'

type ScheduleRow = { user_id: string; updated_at: string; slots: StaffSlot[] }
type AssignmentRow = { user_id: string; function_id: string }
type AbsenceRow = { requester_id: string; start_date: string; end_date: string | null }

export const staffFunctionsQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['staff-functions', tenantId],
    queryFn: (): Promise<StaffFunction[]> =>
      fetchAllPages<StaffFunction>(
        (from, to) =>
          createBrowserSupabaseClient()
            .from('staff_functions')
            .select('id, name')
            .eq('tenant_id', tenantId)
            .order('name')
            .order('id')
            .range(from, to),
        'No se pudieron cargar las funciones.',
      ),
  })

export const staffSchedulesQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['staff-schedules', tenantId],
    queryFn: async (): Promise<StaffSchedule[]> => {
      const db = createBrowserSupabaseClient()
      const [schedules, assignments] = await Promise.all([
        fetchAllPages<ScheduleRow>(
          (from, to) =>
            db
              .from('staff_schedules')
              .select('user_id, updated_at, slots')
              .eq('tenant_id', tenantId)
              .order('user_id')
              .range(from, to),
          'No se pudieron cargar los horarios.',
        ),
        fetchAllPages<AssignmentRow>(
          (from, to) =>
            db
              .from('staff_function_assignments')
              .select('user_id, function_id')
              .eq('tenant_id', tenantId)
              .order('user_id')
              .order('function_id')
              .range(from, to),
          'No se pudieron cargar las funciones asignadas.',
        ),
      ])
      const functionsByUser = new Map<string, string[]>()
      for (const assignment of assignments) {
        const ids = functionsByUser.get(assignment.user_id) ?? []
        ids.push(assignment.function_id)
        functionsByUser.set(assignment.user_id, ids)
      }
      return schedules.map((row) => ({
        userId: row.user_id,
        updatedAt: row.updated_at,
        slots: row.slots,
        functionIds: functionsByUser.get(row.user_id) ?? [],
      }))
    },
  })

export const staffAbsencesQuery = (tenantId: string, from: string, to: string) =>
  queryOptions({
    queryKey: ['staff-absences', tenantId, from, to],
    queryFn: async (): Promise<StaffAbsence[]> => {
      const rows = await fetchAllPages<AbsenceRow>(
        (start, end) =>
          createBrowserSupabaseClient()
            .from('absence_requests')
            .select('requester_id, start_date, end_date')
            .eq('tenant_id', tenantId)
            .eq('status', 'approved')
            .lte('start_date', to)
            .or(`end_date.is.null,end_date.gte.${from}`)
            .order('id')
            .range(start, end),
        'No se pudieron cargar las ausencias aprobadas.',
      )
      return rows.map((row) => ({
        userId: row.requester_id,
        startDate: row.start_date,
        endDate: row.end_date,
      }))
    },
  })

export async function saveStaffSchedule(
  tenantId: string,
  userId: string,
  expected: string | null,
  slots: StaffSlot[],
  functionIds: string[],
) {
  const { error } = await createBrowserSupabaseClient().rpc('save_staff_schedule', {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_expected_updated_at: expected,
    p_slots: slots,
    p_function_ids: functionIds,
  })
  if (error) throw new Error(error.message)
}

export async function saveStaffFunction(tenantId: string, id: string | null, name: string) {
  const db = createBrowserSupabaseClient()
  const result = id
    ? await db
        .from('staff_functions')
        .update({ name }, { count: 'exact' })
        .eq('tenant_id', tenantId)
        .eq('id', id)
    : await db.from('staff_functions').insert({ tenant_id: tenantId, name })
  if (result.error || (id && result.count !== 1))
    throw new Error('No se pudo guardar la función. Comprueba el nombre y tus permisos.')
}

export async function deleteStaffFunction(tenantId: string, id: string) {
  const { error, count } = await createBrowserSupabaseClient()
    .from('staff_functions')
    .delete({ count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('id', id)
  if (error || count !== 1)
    throw new Error('No se pudo eliminar. Comprueba que no esté asignada y revisa tus permisos.')
}
