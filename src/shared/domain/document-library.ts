import { z } from 'zod'

import { invoiceAppearanceSchema } from './document-appearance'
import { defaultEstimateDesign, estimateDesignSchema } from './estimate-design'
import { invoiceDesignSchema } from './invoice-design'
import type { Tenant } from './types'

export const templateLimit = 30
export const estimateBlockLimit = 40
export const documentItemNameLimit = 80
export const estimateBlockContentLimit = 3000
export const estimateBlockLabels = {
  scope: 'Alcance',
  exclusions: 'Exclusiones',
  warranty: 'Garantías',
  conditions: 'Condiciones',
} as const

const documentId = z.string().uuid().toLowerCase()
const named = {
  id: documentId,
  name: z.string().trim().min(1).max(documentItemNameLimit),
}

const estimateTemplate = z.strictObject({ ...named, design: estimateDesignSchema })
const invoiceTemplate = z.strictObject({
  ...named,
  design: invoiceDesignSchema,
  appearance: invoiceAppearanceSchema,
})
const estimateBlock = z.strictObject({
  ...named,
  category: z.enum(['scope', 'exclusions', 'warranty', 'conditions']),
  content: z.string().trim().min(1).max(estimateBlockContentLimit),
})

export const documentLibrarySchema = z
  .strictObject({
    estimates: z.array(estimateTemplate).max(templateLimit),
    invoices: z.array(invoiceTemplate).max(templateLimit),
    blocks: z.array(estimateBlock).max(estimateBlockLimit),
    defaultEstimateId: documentId.nullable(),
    defaultInvoiceId: documentId.nullable(),
    invoiceAppearance: invoiceAppearanceSchema.optional(),
  })
  .refine((library) => {
    const distinct = (items: { id: string }[]) =>
      new Set(items.map(({ id }) => id)).size === items.length
    return (
      distinct(library.estimates) &&
      distinct(library.invoices) &&
      distinct(library.blocks) &&
      (library.defaultEstimateId === null ||
        library.estimates.some(({ id }) => id === library.defaultEstimateId)) &&
      (library.defaultInvoiceId === null ||
        library.invoices.some(({ id }) => id === library.defaultInvoiceId))
    )
  })

export type DocumentLibrary = z.infer<typeof documentLibrarySchema>
export type EstimateBlock = z.infer<typeof estimateBlock>

export const emptyDocumentLibrary: Readonly<DocumentLibrary> = {
  estimates: [],
  invoices: [],
  blocks: [],
  defaultEstimateId: null,
  defaultInvoiceId: null,
}

type Named = { id: string; name: string }

export function namedDocumentOptions(items: readonly Named[], defaultId?: string | null) {
  return items.map(({ id, name }) => ({
    value: id,
    label: id === defaultId ? `${name} · Por defecto` : name,
  }))
}

export function companyEstimateDesign(
  tenant: Pick<Tenant, 'defaultEstimateDesign' | 'documentLibrary'>,
) {
  const library = tenant.documentLibrary
  return (
    library?.estimates.find(({ id }) => id === library.defaultEstimateId)?.design ??
    tenant.defaultEstimateDesign ??
    defaultEstimateDesign
  )
}

export function estimateBlockOptions(blocks: readonly EstimateBlock[]) {
  return blocks.map(({ id, name, category }) => ({
    value: id,
    label: `${estimateBlockLabels[category]} · ${name}`,
  }))
}
