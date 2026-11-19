import { z } from 'zod'

export const documentLogoSizes = ['standard', 'small', 'large'] as const
export const documentLogoPositions = ['auto', 'left', 'center', 'right'] as const

export const documentAppearanceSchema = z.strictObject({
  logoSize: z.enum(documentLogoSizes),
  logoPosition: z.enum(documentLogoPositions),
  accentColor: z.string().regex(/^(?:#[0-9a-f]{6})?$/i),
})

export const invoiceAppearanceSchema = documentAppearanceSchema.extend({
  showLogo: z.boolean(),
  showContact: z.boolean(),
})

export type DocumentAppearance = z.infer<typeof documentAppearanceSchema>
export type InvoiceAppearance = z.infer<typeof invoiceAppearanceSchema>

export const defaultDocumentAppearance: Readonly<DocumentAppearance> = {
  logoSize: 'standard',
  logoPosition: 'auto',
  accentColor: '',
}

export const defaultInvoiceAppearance: Readonly<InvoiceAppearance> = {
  ...defaultDocumentAppearance,
  showLogo: true,
  showContact: true,
}

export function documentAccent(value: string | undefined) {
  const color = value?.trim()
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : undefined
}
