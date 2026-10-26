import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type ContractBillingPeriod = {
  id: string
  cycle_index: number
  period_start_on: string
  period_end_on: string
  net_cents: number | null
  vat_rate: number
  pricing_status: 'priced' | 'requires_review'
  review_reason: string | null
  valuation: { net_cents: number; reason: string } | null
  invoice_draft_id: string | null
}

export type ContractBillingJobError = {
  id: string
  error_code: string
  message: string
  last_seen_at: string
  occurrences: number
}

export async function listOpenContractBillingJobErrors(tenantId: string, contractId: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('contract_billing_job_errors')
    .select('id,error_code,message,last_seen_at,occurrences')
    .eq('tenant_id', tenantId)
    .eq('contract_id', contractId)
    .is('resolved_at', null)
    .order('last_seen_at', { ascending: false })
    .limit(10)
  if (error) throw new Error(error.message)
  return (data ?? []) as ContractBillingJobError[]
}

export async function listContractBillingPeriods(
  tenantId: string,
  contractId: string,
  page: number,
) {
  const pageSize = 20
  const db = createBrowserSupabaseClient()
  const { data, count, error } = await db
    .from('contract_billing_periods')
    .select(
      'id,cycle_index,period_start_on,period_end_on,net_cents,vat_rate,pricing_status,review_reason',
      { count: 'exact' },
    )
    .eq('tenant_id', tenantId)
    .eq('contract_id', contractId)
    .order('cycle_index', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Omit<ContractBillingPeriod, 'valuation' | 'invoice_draft_id'>[]
  const ids = rows.map((row) => row.id)
  if (!ids.length) return { periods: [], count: count ?? 0, pageSize }
  const [valuations, drafts] = await Promise.all([
    db
      .from('contract_billing_period_valuations')
      .select('period_id,net_cents,reason')
      .eq('tenant_id', tenantId)
      .in('period_id', ids),
    db
      .from('invoice_contract_period_drafts')
      .select('id,contract_period_id')
      .eq('tenant_id', tenantId)
      .in('contract_period_id', ids),
  ])
  if (valuations.error) throw new Error(valuations.error.message)
  if (drafts.error) throw new Error(drafts.error.message)
  const valuationByPeriod = new Map(
    (valuations.data ?? []).map((row) => [
      row.period_id,
      { net_cents: Number(row.net_cents), reason: row.reason as string },
    ]),
  )
  const draftByPeriod = new Map(
    (drafts.data ?? []).map((row) => [row.contract_period_id, row.id as string]),
  )
  return {
    periods: rows.map((row) => ({
      ...row,
      valuation: valuationByPeriod.get(row.id) ?? null,
      invoice_draft_id: draftByPeriod.get(row.id) ?? null,
    })),
    count: count ?? 0,
    pageSize,
  }
}

export async function valueContractBillingPeriod(
  tenantId: string,
  periodId: string,
  netCents: number,
  reason: string,
) {
  const { data, error } = await createBrowserSupabaseClient().rpc('value_contract_billing_period', {
    p_tenant_id: tenantId,
    p_period_id: periodId,
    p_net_cents: netCents,
    p_reason: reason,
  })
  if (error || typeof data !== 'string')
    throw new Error(error?.message ?? 'No se pudo valorar el periodo.')
  return data
}

export async function createContractPeriodInvoiceDraft(tenantId: string, periodId: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'create_invoice_contract_period_draft',
    { p_tenant_id: tenantId, p_period_id: periodId },
  )
  if (error || typeof data !== 'string')
    throw new Error(error?.message ?? 'No se pudo preparar el borrador.')
  return data
}

export async function generateContractBillingPeriods(
  tenantId: string,
  contractId: string,
  throughOn: string,
) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'generate_contract_billing_periods',
    {
      p_tenant_id: tenantId,
      p_contract_id: contractId,
      p_through_on: throughOn,
    },
  )
  if (error) throw new Error(error.message)
  return Number(data)
}
