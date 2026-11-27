import { queryOptions } from '@tanstack/react-query'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import { platformPageSize, type ActivityKind } from '../domain/platform-navigation'

export type ActivityValues = Partial<{
  territory: string | null
  monthly_cents: number
  yearly_cents: number
  seat_monthly_cents: number | null
  seats: number
  gifted: boolean
  net_cents: number
  base_net_cents: number
  fixed_net_cents: number
  vat_percent: number
  plan: string
  period: string
  price_source: string
}>
export type ActivityEvent = {
  id: string
  tenant_id: string | null
  company_name: string | null
  actor_email: string | null
  occurred_at: string
  kind: ActivityKind
  subject: string | null
  before: ActivityValues | null
  after: ActivityValues | null
}

export const platformActivityQuery = (
  userId: string,
  company: string | undefined,
  kind: ActivityKind | undefined,
  page: number,
) =>
  queryOptions({
    queryKey: ['platform-activity', userId, company ?? null, kind ?? null, page],
    queryFn: async ({ signal }) => {
      const { data, error } = await createBrowserSupabaseClient()
        .rpc('superadmin_activity', {
          p_company: company ?? null,
          p_kind: kind ?? null,
          p_offset: (page - 1) * platformPageSize,
        })
        .abortSignal(signal)
      if (error || !Array.isArray(data)) throw new Error('No se pudo cargar la actividad.')
      const rows = data as ActivityEvent[]
      return { rows: rows.slice(0, platformPageSize), hasMore: rows.length > platformPageSize }
    },
  })
