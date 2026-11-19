import { z } from 'zod'

export const invoiceDesignSchema = z.enum(['classic', 'modern', 'minimal'])
export type InvoiceDesign = z.infer<typeof invoiceDesignSchema>
export const defaultInvoiceDesign: InvoiceDesign = 'classic'
