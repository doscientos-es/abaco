import {
  estimateSectionLabels,
  estimateSectionsSchema,
  isRequiredEstimateSection,
  requiredEstimateSectionTypes,
  type EstimateSection,
  type EstimateSectionType,
} from '@/shared/domain/estimate-document'
import type { Estimate, EstimateLine } from '@/shared/domain/types'

export function createEstimateSection(
  type: EstimateSectionType,
  newId: () => string,
): EstimateSection {
  const base = { id: newId(), type, title: estimateSectionLabels[type], pageBreakBefore: false }
  switch (type) {
    case 'description':
      return { ...base, type, content: '' }
    case 'prices':
      return { ...base, type, lineIds: [] }
    case 'list':
      return { ...base, type, items: [{ id: newId(), text: '' }] }
    case 'work_table':
      return {
        ...base,
        type,
        rows: [{ id: newId(), task: '', frequency: '', notes: '', periodicities: [] }],
      }
  }
}

export function estimateSectionHasContent(section: EstimateSection): boolean {
  switch (section.type) {
    case 'description':
      return section.content.trim().length > 0
    case 'prices':
      return section.lineIds.length > 0
    case 'list':
      return section.items.some((item) => item.text.trim().length > 0)
    case 'work_table':
      return section.rows.some(
        (row) =>
          (row.periodicities?.length ?? 0) > 0 ||
          [row.task, row.frequency, row.notes].some((text) => text.trim().length > 0),
      )
  }
}

export function requiredEstimateSectionsError(
  estimate: Pick<Estimate, 'documentFormat' | 'sections'>,
): string | null {
  if (estimate.documentFormat !== 'sections') return null
  for (const type of requiredEstimateSectionTypes) {
    if (estimate.sections?.filter((section) => section.type === type).length !== 1)
      return 'El presupuesto debe incluir exactamente una sección de Precio y una de Servicios.'
  }
  return null
}

/** Upgrade editable legacy drafts without dropping priced lines or service rows. */
export function ensureRequiredEstimateSections(
  sections: EstimateSection[],
  newId: () => string,
): EstimateSection[] {
  const result: EstimateSection[] = []
  for (const section of sections) {
    const first = result.find((item) => item.type === section.type)
    if (section.type === 'prices' && first?.type === 'prices') {
      result[result.indexOf(first)] = {
        ...first,
        lineIds: [...new Set([...first.lineIds, ...section.lineIds])],
      }
    } else if (section.type === 'work_table' && first?.type === 'work_table') {
      const ids = new Set(first.rows.map((row) => row.id))
      result[result.indexOf(first)] = {
        ...first,
        rows: [
          ...first.rows,
          ...section.rows.map((row) => ({ ...row, id: ids.has(row.id) ? newId() : row.id })),
        ],
      }
    } else {
      result.push(section)
    }
  }
  for (const type of requiredEstimateSectionTypes) {
    if (!result.some((section) => section.type === type))
      result.push(createEstimateSection(type, newId))
  }
  if (!estimateSectionsSchema.safeParse(result).success) return sections
  return result.length === sections.length &&
    result.every((item, index) => item === sections[index])
    ? sections
    : result
}

/** Required sections cannot be replaced, even through a stale editor callback. */
export function changeEstimateSectionType(
  estimate: Estimate,
  sectionId: string,
  type: EstimateSectionType,
  newId: () => string,
): Partial<Estimate> {
  const section = estimate.sections?.find((item) => item.id === sectionId)
  if (
    !section ||
    section.type === type ||
    isRequiredEstimateSection(section.type) ||
    isRequiredEstimateSection(type)
  )
    return {}
  const replacement = {
    ...createEstimateSection(type, newId),
    id: section.id,
    title: section.title,
    pageBreakBefore: section.pageBreakBefore,
  }
  return {
    ...removeEstimateSection(estimate, sectionId),
    sections: estimate.sections?.map((item) => (item.id === sectionId ? replacement : item)) ?? [],
  }
}

/** Lines remain the single source of truth for totals, invoices and contract conversion. */
export function replaceSectionLines(
  estimate: Estimate,
  sectionId: string,
  lines: EstimateLine[],
): Partial<Estimate> {
  const section = estimate.sections?.find((item) => item.id === sectionId)
  if (!section || section.type !== 'prices') return {}
  const replacedIds = new Set(section.lineIds)
  return {
    lines: [...estimate.lines.filter((line) => !replacedIds.has(line.id)), ...lines],
    sections:
      estimate.sections?.map((item) =>
        item.id === sectionId ? { ...section, lineIds: lines.map((line) => line.id) } : item,
      ) ?? [],
  }
}

export function removeEstimateSection(estimate: Estimate, sectionId: string): Partial<Estimate> {
  const section = estimate.sections?.find((item) => item.id === sectionId)
  if (!section || isRequiredEstimateSection(section.type)) return {}
  return {
    sections: estimate.sections?.filter((item) => item.id !== sectionId) ?? [],
  }
}

export function moveEstimateSection(
  sections: EstimateSection[],
  id: string,
  direction: -1 | 1,
): EstimateSection[] {
  const index = sections.findIndex((section) => section.id === id)
  const destination = index + direction
  if (index < 0 || destination < 0 || destination >= sections.length) return sections
  const result = [...sections]
  const [section] = result.splice(index, 1)
  if (section) result.splice(destination, 0, section)
  return result
}

export function copyEstimateSections(
  sections: EstimateSection[],
  lineIds: Map<string, string>,
  newId: () => string,
): EstimateSection[] {
  return sections.map((section) => {
    const base = { ...section, id: newId() }
    switch (base.type) {
      case 'prices':
        return { ...base, lineIds: base.lineIds.flatMap((id) => lineIds.get(id) ?? []) }
      case 'list':
        return { ...base, items: base.items.map((item) => ({ ...item, id: newId() })) }
      case 'work_table':
        return { ...base, rows: base.rows.map((row) => ({ ...row, id: newId() })) }
      default:
        return base
    }
  })
}

export function duplicateEstimateSection(
  estimate: Estimate,
  id: string,
  newId: () => string,
): Partial<Estimate> {
  const sections = estimate.sections ?? []
  const index = sections.findIndex((section) => section.id === id)
  const section = sections[index]
  if (!section || sections.length >= 50 || isRequiredEstimateSection(section.type)) return {}
  const [copy] = copyEstimateSections([section], new Map(), newId)
  if (!copy) return {}
  copy.title = `${copy.title} (copia)`.slice(0, 200)
  return {
    sections: [...sections.slice(0, index + 1), copy, ...sections.slice(index + 1)],
  }
}
