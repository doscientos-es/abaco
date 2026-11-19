import { z } from 'zod'

import { documentAppearanceSchema } from './document-appearance'

/** Visual preferences only. The estimate format still determines the commercial content. */
export const estimateDesignSchema = z.strictObject({
  layout: z.enum(['compact', 'proposal', 'minimal', 'editorial']),
  showIndex: z.boolean(),
  showLogo: z.boolean(),
  showFooter: z.boolean(),
  appearance: documentAppearanceSchema.optional(),
})

export type EstimateDesign = z.infer<typeof estimateDesignSchema>

/** Also used for old publications, which must never inherit current company defaults. */
export const defaultEstimateDesign: Readonly<EstimateDesign> = Object.freeze({
  layout: 'proposal',
  showIndex: true,
  showLogo: true,
  showFooter: true,
})

export function sameEstimateDesign(a: EstimateDesign, b: EstimateDesign): boolean {
  return (
    a.layout === b.layout &&
    a.showIndex === b.showIndex &&
    a.showLogo === b.showLogo &&
    a.showFooter === b.showFooter &&
    a.appearance?.logoSize === b.appearance?.logoSize &&
    a.appearance?.logoPosition === b.appearance?.logoPosition &&
    a.appearance?.accentColor === b.appearance?.accentColor
  )
}
