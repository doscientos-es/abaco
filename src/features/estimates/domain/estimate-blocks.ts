import type { EstimateBlock } from '@/shared/domain/document-library'
import { estimateSectionLimits } from '@/shared/domain/estimate-document'
import { formLimits } from '@/shared/domain/form-limits'
import type { Estimate } from '@/shared/domain/types'

export function estimateBlockFitError(estimate: Estimate, block: EstimateBlock) {
  if (estimate.documentFormat === 'sections') {
    return (estimate.sections?.length ?? 0) >= estimateSectionLimits.sections
      ? 'El presupuesto ya tiene el máximo de secciones.'
      : null
  }
  return appendBlock(estimate.clauses, block).length > formLimits.estimateClauses
    ? 'El bloque supera el espacio disponible en las condiciones.'
    : null
}

export function insertEstimateBlock(
  estimate: Estimate,
  block: EstimateBlock,
  newId: () => string,
): Partial<Pick<Estimate, 'clauses' | 'sections'>> | null {
  if (estimateBlockFitError(estimate, block)) return null
  if (estimate.documentFormat !== 'sections')
    return { clauses: appendBlock(estimate.clauses, block) }
  return {
    sections: [
      ...(estimate.sections ?? []),
      {
        id: newId(),
        type: 'description',
        title: block.name,
        content: block.content,
        pageBreakBefore: false,
      },
    ],
  }
}

function appendBlock(clauses: string, block: EstimateBlock) {
  return [clauses.trimEnd(), `${block.name}\n${block.content}`].filter(Boolean).join('\n\n')
}
