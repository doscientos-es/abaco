import { compareEstimateValidity } from '@/features/estimates/domain/estimate-follow-up'
import {
  compareInvoiceDueDate,
  invoiceOutstandingCents,
  isCollectionPending,
} from '@/features/invoices/domain/invoice-collection'
import type { Estimate, Invoice } from '@/shared/domain/types'

export function selectClientCommercialOverview(
  tenantId: string,
  clientId: string,
  estimates: readonly Estimate[],
  invoices: readonly Invoice[],
) {
  const sent = estimates
    .filter(
      (item) => item.tenantId === tenantId && item.clientId === clientId && item.status === 'sent',
    )
    .sort(compareEstimateValidity)
  const outstanding = invoices
    .filter(
      (item) =>
        item.tenantId === tenantId && item.clientId === clientId && isCollectionPending(item),
    )
    .sort(compareInvoiceDueDate)
  return {
    sent,
    outstanding,
    outstandingCents: outstanding.reduce((sum, item) => sum + invoiceOutstandingCents(item), 0),
  }
}
