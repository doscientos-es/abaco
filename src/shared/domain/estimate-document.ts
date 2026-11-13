import { z } from 'zod'

import { servicePeriodicitiesSchema } from './service-periodicity'

export const estimateFormatLabels = {
  table: 'Tabla de precios',
  sections: 'Por secciones',
} as const

export type EstimateFormat = keyof typeof estimateFormatLabels

export const estimateSectionLabels = {
  description: 'Texto',
  prices: 'Precio',
  work_table: 'Servicios',
  list: 'Lista',
} as const

export const editableEstimateSectionTypes = ['description'] as const
export const requiredEstimateSectionTypes = ['prices', 'work_table'] as const

export function isRequiredEstimateSection(type: EstimateSectionType): boolean {
  return type === 'prices' || type === 'work_table'
}

export const estimateSectionLimits = { sections: 50, text: 10_000, rows: 100, item: 2000 } as const

const base = {
  id: z.string().uuid(),
  title: z.string().max(200),
  pageBreakBefore: z.boolean(),
}

export const estimateSectionsSchema = z
  .array(
    z.discriminatedUnion('type', [
      z
        .object({ ...base, type: z.literal('description'), content: z.string().max(10_000) })
        .strict(),
      z
        .object({
          ...base,
          type: z.literal('prices'),
          lineIds: z.array(z.string().uuid()).max(500),
          grossCents: z.number().int().min(0).max(99_999_999_999).optional(),
        })
        .strict(),
      z
        .object({
          ...base,
          type: z.literal('list'),
          items: z
            .array(
              z
                .object({
                  id: z.string().uuid(),
                  text: z.string().max(2000),
                })
                .strict(),
            )
            .max(100),
        })
        .strict(),
      z
        .object({
          ...base,
          type: z.literal('work_table'),
          rows: z
            .array(
              z
                .object({
                  id: z.string().uuid(),
                  task: z.string().max(2000),
                  frequency: z.string().max(200),
                  notes: z.string().max(2000),
                  periodicities: servicePeriodicitiesSchema.optional(),
                })
                .strict(),
            )
            .max(100),
        })
        .strict(),
    ]),
  )
  .max(50)
  .superRefine((sections, context) => {
    const ids = sections.map((section) => section.id)
    const lineIds = sections.flatMap((section) =>
      section.type === 'prices' ? section.lineIds : [],
    )
    if (new Set(ids).size !== ids.length || new Set(lineIds).size !== lineIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Las secciones y las partidas no pueden repetirse.',
      })
    }
    for (const section of sections) {
      const rows =
        section.type === 'list' ? section.items : section.type === 'work_table' ? section.rows : []
      if (new Set(rows.map((row) => row.id)).size !== rows.length) {
        context.addIssue({
          code: 'custom',
          message: 'Los elementos de una sección no pueden repetirse.',
        })
      }
    }
    if (JSON.stringify(sections).length > 1_000_000) {
      context.addIssue({
        code: 'custom',
        message: 'El contenido del presupuesto es demasiado extenso.',
      })
    }
  })

export type EstimateSection = z.infer<typeof estimateSectionsSchema>[number]
export type EstimateSectionType = EstimateSection['type']
