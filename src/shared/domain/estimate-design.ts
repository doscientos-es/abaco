import { z } from 'zod'

/** Visual preferences only. The estimate format still determines the commercial content. */
export const estimateDesignSchema = z.strictObject({
  layout: z.enum(['compact', 'proposal']),
  showIndex: z.boolean(),
  showLogo: z.boolean(),
  showFooter: z.boolean(),
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
    a.showFooter === b.showFooter
  )
}
