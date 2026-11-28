import { centsToPlain } from '@/shared/domain/money'
import type { Invoice } from '@/shared/domain/types'
import { writeCsv } from '@/shared/lib/write-csv'

import { invoiceOutstandingCents } from './invoice-collection'

type ExportCollectionRow = Pick<
  Invoice,
  'number' | 'clientId' | 'dueDate' | 'totalCents' | 'paidCents'
>

export function buildCollectionsWorklistCsv(
  invoices: readonly ExportCollectionRow[],
  clientName: (id: string) => string,
): string {
  return writeCsv(
    ['Número', 'Cliente', 'Vencimiento', 'Importe EUR', 'Cobrado EUR', 'Saldo EUR'],
    invoices.map((i) => [
      i.number,
      clientName(i.clientId),
      i.dueDate,
      centsToPlain(i.totalCents),
      centsToPlain(i.paidCents),
      centsToPlain(invoiceOutstandingCents(i)),
    ]),
  )
}
