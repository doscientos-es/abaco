import { describe, expect, it } from 'vitest'

import {
  estimateSignaturePath,
  estimateSignaturePointCount,
  isEstimateSignature,
} from './estimate-signature'

describe('estimate signature', () => {
  it('accepts bounded normalized strokes and builds an SVG path', () => {
    const signature = [
      [
        { x: 0.1, y: 0.2 },
        { x: 0.9, y: 0.8 },
      ],
    ]

    expect(isEstimateSignature(signature)).toBe(true)
    expect(estimateSignaturePath(signature)).toBe('M60 32 L540 128')
    expect(estimateSignaturePointCount(signature)).toBe(2)
  })

  it('rejects empty, dot-only, oversized, and out-of-bounds signatures', () => {
    expect(isEstimateSignature([])).toBe(false)
    expect(isEstimateSignature([[{ x: 0.5, y: 0.5 }]])).toBe(false)
    expect(
      isEstimateSignature([
        [
          { x: -0.1, y: 0.5 },
          { x: 0.5, y: 0.5 },
        ],
      ]),
    ).toBe(false)
    expect(isEstimateSignature([Array.from({ length: 301 }, () => ({ x: 0.5, y: 0.5 }))])).toBe(
      false,
    )
    expect(
      isEstimateSignature(
        Array.from({ length: 11 }, () => [
          { x: 0.2, y: 0.5 },
          { x: 0.8, y: 0.5 },
        ]),
      ),
    ).toBe(false)
  })
})
