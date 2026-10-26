import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type InvoiceMilestoneDraft = {
  id: string
  tenant_id: string
  estimate_id: string
  milestone_id: string
  client_id: string
  concept: string
  total_cents: number
  vat_rate: number
  due_date: string
  revision: number
  status: 'draft' | 'issued'
  created_at: string
}

export type InvoiceWorkExtraDraft = {
  id: string
  tenant_id: string
  work_extra_id: string
  work_order_id: string
  client_id: string
  concept: string
  total_cents: number
  vat_rate: number
  due_date: string
  revision: number
  status: 'draft' | 'issued'
  created_at: string
}

export type InvoiceContractPeriodDraft = {
  id: string
  tenant_id: string
  contract_period_id: string
  contract_id: string
  client_id: string
  concept: string
  total_cents: number
  vat_rate: number
  due_date: string
  revision: number
  status: 'draft' | 'issued'
  created_at: string
}

const pageSize = 20

export async function listOpenInvoiceDrafts(tenantId: string, page = 0) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('invoice_milestone_drafts')
    .select(
      'id,tenant_id,estimate_id,milestone_id,client_id,concept,total_cents,vat_rate,due_date,revision,status,created_at',
    )
    .eq('tenant_id', tenantId)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize)
  if (error) throw new Error(error.message)
  return {
    items: (data ?? []).slice(0, pageSize) as InvoiceMilestoneDraft[],
    hasMore: (data?.length ?? 0) > pageSize,
  }
}

export async function createMilestoneInvoiceDraft(input: {
  tenantId: string
  estimateId: string
  milestoneId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'create_invoice_milestone_draft',
    {
      p_tenant_id: input.tenantId,
      p_estimate_id: input.estimateId,
      p_milestone_id: input.milestoneId,
    },
  )
  if (error) throw new Error(error.message)
  return data as string
}

export async function updateMilestoneInvoiceDraft(input: {
  tenantId: string
  draftId: string
  revision: number
  concept: string
  dueDate: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'update_invoice_milestone_draft',
    {
      p_tenant_id: input.tenantId,
      p_draft_id: input.draftId,
      p_expected_revision: input.revision,
      p_concept: input.concept,
      p_due_date: input.dueDate,
    },
  )
  if (error) throw new Error(error.message)
  return data as number
}

export async function issueMilestoneInvoiceDraft(input: {
  tenantId: string
  draftId: string
  revision: number
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc('issue_invoice_milestone_draft', {
    p_tenant_id: input.tenantId,
    p_draft_id: input.draftId,
    p_expected_revision: input.revision,
    p_operation_id: input.operationId,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function listOpenWorkExtraInvoiceDrafts(tenantId: string, page = 0) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('invoice_work_extra_drafts')
    .select(
      'id,tenant_id,work_extra_id,work_order_id,client_id,concept,total_cents,vat_rate,due_date,revision,status,created_at',
    )
    .eq('tenant_id', tenantId)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize)
  if (error) throw new Error(error.message)
  return {
    items: (data ?? []).slice(0, pageSize) as InvoiceWorkExtraDraft[],
    hasMore: (data?.length ?? 0) > pageSize,
  }
}

export async function createWorkExtraInvoiceDraft(input: { tenantId: string; extraId: string }) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'create_invoice_work_extra_draft',
    { p_tenant_id: input.tenantId, p_extra_id: input.extraId },
  )
  if (error) throw new Error(error.message)
  return data as string
}

export async function updateWorkExtraInvoiceDraft(input: {
  tenantId: string
  draftId: string
  revision: number
  concept: string
  dueDate: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'update_invoice_work_extra_draft',
    {
      p_tenant_id: input.tenantId,
      p_draft_id: input.draftId,
      p_expected_revision: input.revision,
      p_concept: input.concept,
      p_due_date: input.dueDate,
    },
  )
  if (error) throw new Error(error.message)
  return data as number
}

export async function issueWorkExtraInvoiceDraft(input: {
  tenantId: string
  draftId: string
  revision: number
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'issue_invoice_work_extra_draft',
    {
      p_tenant_id: input.tenantId,
      p_draft_id: input.draftId,
      p_expected_revision: input.revision,
      p_operation_id: input.operationId,
    },
  )
  if (error) throw new Error(error.message)
  return data as string
}

export async function listOpenContractPeriodInvoiceDrafts(tenantId: string, page = 0) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('invoice_contract_period_drafts')
    .select(
      'id,tenant_id,contract_period_id,contract_id,client_id,concept,total_cents,vat_rate,due_date,revision,status,created_at',
    )
    .eq('tenant_id', tenantId)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize)
  if (error) throw new Error(error.message)
  return {
    items: (data ?? []).slice(0, pageSize) as InvoiceContractPeriodDraft[],
    hasMore: (data?.length ?? 0) > pageSize,
  }
}

export async function updateContractPeriodInvoiceDraft(input: {
  tenantId: string
  draftId: string
  revision: number
  concept: string
  dueDate: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'update_invoice_contract_period_draft',
    {
      p_tenant_id: input.tenantId,
      p_draft_id: input.draftId,
      p_expected_revision: input.revision,
      p_concept: input.concept,
      p_due_date: input.dueDate,
    },
  )
  if (error) throw new Error(error.message)
  return data as number
}

export async function issueContractPeriodInvoiceDraft(input: {
  tenantId: string
  draftId: string
  revision: number
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'issue_invoice_contract_period_draft',
    {
      p_tenant_id: input.tenantId,
      p_draft_id: input.draftId,
      p_expected_revision: input.revision,
      p_operation_id: input.operationId,
    },
  )
  if (error) throw new Error(error.message)
  return data as string
}
