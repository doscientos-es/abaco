import { z } from 'zod'

const workSearch = z.object({
  equipo: z
    .union([z.literal('unassigned'), z.string().uuid()])
    .optional()
    .catch(undefined),
  estado: z
    .enum(['ready', 'scheduled', 'in_progress', 'completed', 'canceled'])
    .optional()
    .catch(undefined),
  pagina: z.coerce.number().int().min(0).max(100000).optional().catch(undefined),
})

export type WorkSearch = z.infer<typeof workSearch>

export function parseWorkSearch(search: Record<string, unknown>): WorkSearch {
  return workSearch.parse(search)
}
