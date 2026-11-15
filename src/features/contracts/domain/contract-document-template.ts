import { z } from 'zod'

export const contractTemplateLimits = { sections: 20, title: 200, content: 10_000 } as const

const sectionSchema = z
  .object({
    id: z.string().min(1).max(100),
    title: z.string().max(contractTemplateLimits.title),
    content: z.string().max(contractTemplateLimits.content),
    pageBreakBefore: z.boolean(),
    format: z.literal('markdown').optional(),
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

export const librarySectionSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().max(contractTemplateLimits.title),
  content: z.string().max(contractTemplateLimits.content),
  page_break_before: z.boolean(),
  format: z.enum(['plain', 'markdown']),
  revision: z.number().int().positive(),
})

export const libraryTemplateSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(200),
    before_ids: z.array(z.string().min(1).max(100)).max(contractTemplateLimits.sections),
    after_ids: z.array(z.string().min(1).max(100)).max(contractTemplateLimits.sections),
    revision: z.number().int().positive(),
  })
  .refine(({ before_ids, after_ids }) => {
    const ids = [...before_ids, ...after_ids]
    return new Set(ids).size === ids.length
  }, 'Una sección no puede aparecer dos veces.')

export type LibrarySection = z.infer<typeof librarySectionSchema>
export type LibraryTemplate = z.infer<typeof libraryTemplateSchema>

export function snapshotLibraryTemplate(
  template: LibraryTemplate,
  sections: LibrarySection[],
): ContractDocumentSections {
  function snapshot(ids: string[]): ContractDocumentSection[] {
    return ids.map((id) => {
      const section = sections.find((item) => item.id === id)
      if (!section) throw new Error('Falta una sección de la plantilla. Recarga la biblioteca.')
      return {
        id,
        title: section.title,
        content: section.content,
        pageBreakBefore: section.page_break_before,
        ...(section.format === 'markdown' ? { format: 'markdown' as const } : {}),
      }
    })
  }
  return { before: snapshot(template.before_ids), after: snapshot(template.after_ids) }
}
