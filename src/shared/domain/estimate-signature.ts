import type { EstimateSignature } from './types'

export const estimateSignatureLimits = { strokes: 10, points: 300 } as const

export function isEstimateSignature(value: unknown): value is EstimateSignature {
  if (!Array.isArray(value) || value.length < 1 || value.length > estimateSignatureLimits.strokes)
    return false

  let pointCount = 0
  let hasDrawnStroke = false
  for (const stroke of value) {
    if (!Array.isArray(stroke) || stroke.length < 1) return false
    if (stroke.length > 1) hasDrawnStroke = true
    pointCount += stroke.length
    if (pointCount > estimateSignatureLimits.points) return false
    for (const point of stroke) {
      if (
        !point ||
        typeof point !== 'object' ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < 0 ||
        point.x > 1 ||
        point.y < 0 ||
        point.y > 1
      )
        return false
    }
  }
  return hasDrawnStroke
}

export function estimateSignaturePath(signature: EstimateSignature): string {
  return signature
    .map((stroke) =>
      stroke
        .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x * 600} ${point.y * 160}`)
        .join(' '),
    )
    .join(' ')
}

export function estimateSignaturePointCount(signature: EstimateSignature): number {
  return signature.reduce((count, stroke) => count + stroke.length, 0)
}
