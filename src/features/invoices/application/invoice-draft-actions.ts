import type { InvoiceDraftSource } from '../domain/invoice-draft'

export {
  createMilestoneInvoiceDraft,
  createWorkExtraInvoiceDraft,
  issueInvoiceDraft,
  listOpenInvoiceDrafts,
  updateInvoiceDraft,
} from '../infrastructure/invoice-draft-repository'

export function invoiceDraftsQueryKey(source: InvoiceDraftSource, tenantId: string) {
  return [`invoice-${source.replaceAll('_', '-')}-drafts`, tenantId] as const
}
