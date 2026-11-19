import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import type { InvoiceDraft, InvoiceDraftSource } from '../domain/invoice-draft'

const originColumns = {
  milestone: 'estimate_id',
  work_extra: 'work_order_id',
  contract_period: 'contract_id',
} satisfies Record<InvoiceDraftSource, string>

const pageSize = 20

export async function listOpenInvoiceDrafts(
  source: InvoiceDraftSource,
  tenantId: string,
  page = 0,
) {
  const { data, error } = await createBrowserSupabaseClient()
    .from(`invoice_${source}_drafts`)
    .select(
      `id,tenantId:tenant_id,originId:${originColumns[source]},concept,totalCents:total_cents,dueDate:due_date,revision`,
    )
    .eq('tenant_id', tenantId)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize)
    .overrideTypes<Omit<InvoiceDraft, 'source'>[], { merge: false }>()
  if (error) throw new Error(error.message)
  return {
    items: (data ?? []).slice(0, pageSize).map((draft) => ({ ...draft, source })),
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

export async function updateInvoiceDraft(input: {
  source: InvoiceDraftSource
  tenantId: string
  draftId: string
  revision: number
  concept: string
  dueDate: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    `update_invoice_${input.source}_draft`,
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

export async function issueInvoiceDraft(input: {
  source: InvoiceDraftSource
  tenantId: string
  draftId: string
  revision: number
  operationId: string
  templateId: string | null
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'issue_invoice_draft_with_template',
    {
      p_source: input.source,
      p_tenant_id: input.tenantId,
      p_draft_id: input.draftId,
      p_expected_revision: input.revision,
      p_operation_id: input.operationId,
      p_template_id: input.templateId,
    },
  )
  if (error) throw new Error(error.message)
  return data as string
}

export async function createWorkExtraInvoiceDraft(input: { tenantId: string; extraId: string }) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'create_invoice_work_extra_draft',
    { p_tenant_id: input.tenantId, p_extra_id: input.extraId },
  )
  if (error) throw new Error(error.message)
  return data as string
}
