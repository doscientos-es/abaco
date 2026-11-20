import { Button } from '@doscientos/ui'
import { useRef } from 'react'

import {
  estimateSignatureLimits,
  estimateSignaturePointCount,
} from '@/shared/domain/estimate-signature'
import type { EstimateSignature, EstimateSignaturePoint } from '@/shared/domain/types'

export function PublicEstimateSignature({
  value,
  onChange,
  disabled = false,
}: {
  value: EstimateSignature
  onChange: (signature: EstimateSignature) => void
  disabled?: boolean
}) {
  const drawing = useRef(false)
  const points = estimateSignaturePointCount(value)

  function point(event: React.PointerEvent<SVGSVGElement>): EstimateSignaturePoint | undefined {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    }
  }

  function start(event: React.PointerEvent<SVGSVGElement>) {
    if (disabled || points >= estimateSignatureLimits.points) return
    const nextPoint = point(event)
    if (!nextPoint) return
    event.preventDefault()
    drawing.current = true
    onChange([...value, [nextPoint]])
  }

  function move(event: React.PointerEvent<SVGSVGElement>) {
    if (!drawing.current || disabled || points >= estimateSignatureLimits.points) return
    const nextPoint = point(event)
    if (!nextPoint) return
    event.preventDefault()
    const next = [...value]
    const lastStroke = next.at(-1)
    if (lastStroke) next[next.length - 1] = [...lastStroke, nextPoint]
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <svg
        viewBox="0 0 600 160"
        role="img"
        aria-label="Área para dibujar tu firma"
        aria-describedby="estimate-signature-help"
        className="border-border bg-background h-32 w-full touch-none rounded-md border"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={() => {
          drawing.current = false
        }}
        onPointerCancel={() => {
          drawing.current = false
        }}
        onLostPointerCapture={() => {
          drawing.current = false
        }}
      >
        <line x1="24" y1="136" x2="576" y2="136" stroke="currentColor" opacity="0.18" />
        {value.map((stroke, index) => (
          <path
            key={index}
            d={stroke
              .map(
                (point, pointIndex) =>
                  `${pointIndex === 0 ? 'M' : 'L'}${point.x * 600} ${point.y * 160}`,
              )
              .join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id="estimate-signature-help" className="text-muted-foreground text-xs">
          Firma con el dedo o el ratón. La firma se guarda junto con tu aceptación.
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          isDisabled={disabled || value.length === 0}
          onPress={() => onChange([])}
        >
          Borrar firma
        </Button>
      </div>
    </div>
  )
}
