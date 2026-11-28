import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import {
  handoffPendingLimit,
  latestHandoffVisit,
  type HandoffIncident,
  type HandoffTiming,
  type HandoffVisit,
} from '../domain/client-handoff'

type HandoffScope = {
  tenantId: string
  clientId: string
  locationId: string | null
  signal?: AbortSignal
}

export async function loadHandoffTiming({
  tenantId,
  clientId,
  locationId,
  signal,
  now = new Date(),
}: HandoffScope & { now?: Date }): Promise<HandoffTiming> {
  const db = createBrowserSupabaseClient()
  const scoped = () => {
    const query = db
      .from('service_visits')
      .select('title,location_id,scheduled_start_at,actual_start_at,actual_end_at,performed_on')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
    if (locationId) query.eq('location_id', locationId)
    if (signal) query.abortSignal(signal)
    return query
  }
  const completed = () => scoped().eq('status', 'completed')
  const [paper, app, active, next] = await Promise.all([
    completed()
      .not('performed_on', 'is', null)
      .order('performed_on', { ascending: false })
      .order('id')
      .limit(1)
      .maybeSingle(),
    completed()
      .is('performed_on', null)
      .not('actual_end_at', 'is', null)
      .order('actual_end_at', { ascending: false })
      .order('id')
      .limit(1)
      .maybeSingle(),
    scoped()
      .eq('status', 'in_progress')
      .order('actual_start_at', { ascending: false, nullsFirst: false })
      .order('scheduled_start_at', { ascending: false })
      .order('id')
      .limit(1)
      .maybeSingle(),
    scoped()
      .eq('status', 'scheduled')
      .gte('scheduled_start_at', now.toISOString())
      .order('scheduled_start_at')
      .order('id')
      .limit(1)
      .maybeSingle(),
  ])
  if ([paper, app, active, next].some(({ error }) => error))
    throw new Error('No se pudieron comprobar las visitas de este ámbito.')

  let undated: HandoffVisit | null = null
  if (!paper.data && !app.data) {
    const fallback = await completed()
      .is('performed_on', null)
      .is('actual_end_at', null)
      .order('scheduled_start_at', { ascending: false })
      .order('id')
      .limit(1)
      .maybeSingle()
    if (fallback.error) throw new Error('No se pudieron comprobar las visitas de este ámbito.')
    undated = fallback.data as HandoffVisit | null
  }
  return {
    last: latestHandoffVisit(
      paper.data as HandoffVisit | null,
      app.data as HandoffVisit | null,
      undated,
    ),
    active: active.data as HandoffVisit | null,
    next: next.data as HandoffVisit | null,
  }
}

export async function loadHandoffIncidents({
  tenantId,
  clientId,
  locationId,
  signal,
}: HandoffScope) {
  const query = createBrowserSupabaseClient()
    .from('service_incidents')
    .select('id,title,location_id,status,due_at,updated_at')
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)
    .in('status', ['open', 'in_progress', 'reopened'])
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .order('id')
    .limit(handoffPendingLimit + 1)
  if (locationId) query.eq('location_id', locationId)
  if (signal) query.abortSignal(signal)
  const { data, error } = await query
  if (error) throw new Error('No se pudieron comprobar las incidencias pendientes de este ámbito.')
  return {
    items: ((data ?? []) as HandoffIncident[]).slice(0, handoffPendingLimit),
    hasMore: (data?.length ?? 0) > handoffPendingLimit,
  }
}
