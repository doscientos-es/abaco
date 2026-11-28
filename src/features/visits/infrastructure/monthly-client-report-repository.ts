import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import {
  monthlyClientReportLimit,
  monthlyClientReportRange,
  type MonthlyClientReport,
  type MonthlyExtra,
  type MonthlyVisit,
} from '../domain/monthly-client-report'

type Relation<T> = T | T[] | null
type Centre = { name: string }
type ExtraWork = { location: Relation<Centre> }
type VisitRow = {
  id: string
  title: string
  scheduled_start_at: string
  status: MonthlyVisit['status']
  location: Relation<Centre>
}
type ExtraRow = {
  id: string
  description: string
  proposed_at: string
  status: MonthlyExtra['status']
  quantity: number
  unit: string
  work: Relation<ExtraWork>
}

function singleRelated<T>(value: Relation<T>) {
  return (Array.isArray(value) ? value[0] : value) ?? null
}

export async function loadMonthlyClientReport({
  tenantId,
  clientId,
  locationId,
  month,
  signal,
}: {
  tenantId: string
  clientId: string
  locationId: string | null
  month: string
  signal?: AbortSignal
}): Promise<MonthlyClientReport> {
  const period = monthlyClientReportRange(month)
  if (!period) throw new Error('Elige un mes válido.')
  const db = createBrowserSupabaseClient()
  // Do not fetch paper snapshots, contacts, assignments, internal notes, prices or evidence.
  const visits = db
    .from('service_visits')
    .select('id,title,scheduled_start_at,status,location:service_locations(name)')
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)
    .gte('scheduled_start_at', period.from)
    .lt('scheduled_start_at', period.before)
    .order('scheduled_start_at')
    .order('id')
    .limit(monthlyClientReportLimit + 1)
  const extras = db
    .from('work_order_extras')
    .select(
      'id,description,proposed_at,status,quantity,unit,work:work_orders!inner(location:service_locations!work_orders_location_fk(name))',
    )
    .eq('tenant_id', tenantId)
    .eq('work.tenant_id', tenantId)
    .eq('work.client_id', clientId)
    .gte('proposed_at', period.from)
    .lt('proposed_at', period.before)
    .order('proposed_at')
    .order('id')
    .limit(monthlyClientReportLimit + 1)
  if (locationId) {
    visits.eq('location_id', locationId)
    extras.eq('work.location_id', locationId)
  }
  if (signal) {
    visits.abortSignal(signal)
    extras.abortSignal(signal)
  }
  const [visitResult, extraResult] = await Promise.all([visits, extras])
  if (visitResult.error || extraResult.error)
    throw new Error('No se pudo cargar el informe completo. Vuelve a intentarlo.')
  if (
    (visitResult.data?.length ?? 0) > monthlyClientReportLimit ||
    (extraResult.data?.length ?? 0) > monthlyClientReportLimit
  ) {
    throw new Error(
      `Se superan las ${monthlyClientReportLimit} visitas o extras por informe. Selecciona un centro o revisa otro mes. No se ha preparado un informe parcial.`,
    )
  }

  return {
    visits: ((visitResult.data ?? []) as VisitRow[]).map((visit) => ({
      id: visit.id,
      title: visit.title,
      date: visit.scheduled_start_at,
      status: visit.status,
      centre: singleRelated(visit.location)?.name ?? 'Sin centro',
    })),
    extras: ((extraResult.data ?? []) as ExtraRow[]).map((extra) => ({
      id: extra.id,
      title: extra.description,
      date: extra.proposed_at,
      status: extra.status,
      quantity: extra.quantity,
      unit: extra.unit,
      centre: singleRelated(singleRelated(extra.work)?.location ?? null)?.name ?? 'Sin centro',
    })),
  }
}
