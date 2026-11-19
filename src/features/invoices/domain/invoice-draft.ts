export const invoiceDraftSources = ['milestone', 'work_extra', 'contract_period'] as const
export type InvoiceDraftSource = (typeof invoiceDraftSources)[number]

export type InvoiceDraft = {
  id: string
  tenantId: string
  source: InvoiceDraftSource
  originId: string
  concept: string
  totalCents: number
  dueDate: string
  revision: number
}
