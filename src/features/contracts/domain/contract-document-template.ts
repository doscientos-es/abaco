import { z } from 'zod'

export const contractTemplateLimits = { sections: 20, title: 200, content: 10_000 } as const

const sectionSchema = z
  .object({
    id: z.string().min(1).max(100),
    title: z.string().max(contractTemplateLimits.title),
    content: z.string().max(contractTemplateLimits.content),
    pageBreakBefore: z.boolean(),
  })
  .strict()

export const contractDocumentSectionsSchema = z
  .object({
    before: z.array(sectionSchema).max(contractTemplateLimits.sections),
    after: z.array(sectionSchema).max(contractTemplateLimits.sections),
  })
  .strict()
  .refine((sections) => {
    const ids = [...sections.before, ...sections.after].map((section) => section.id)
    return new Set(ids).size === ids.length
  })

export type ContractDocumentSections = z.infer<typeof contractDocumentSectionsSchema>
export type ContractDocumentSection = ContractDocumentSections['before'][number]
export type ContractDocumentTemplate = { sections: ContractDocumentSections; revision: number }

export function emptyContractDocumentSections(): ContractDocumentSections {
  return { before: [], after: [] }
}
