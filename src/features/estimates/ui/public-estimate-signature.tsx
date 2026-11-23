/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Inline SVG is needed for the signature drawing and preview. */
import {
  Button,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '@doscientos/ui'
import { useEffect, useRef, useState } from 'react'

import {
  estimateSignatureLimits,
  estimateSignaturePath,
  estimateSignaturePointCount,
  isEstimateSignature,
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
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<EstimateSignature>(value)

  useEffect(() => {
    if (!open) return
    const root = document.documentElement
    const alreadyLocked = root.hasAttribute('data-estimate-signature-open')
    root.setAttribute('data-estimate-signature-open', '')
    return () => {
      if (!alreadyLocked) root.removeAttribute('data-estimate-signature-open')
    }
  }, [open])

  return (
    <div className="space-y-3">
      {isEstimateSignature(value) ? (
        <svg
          viewBox="0 0 600 160"
          preserveAspectRatio="none"
          role="img"
          aria-label="Firma dibujada"
          className="border-border bg-background h-28 w-full rounded-md border"
        >
          <path
            d={estimateSignaturePath(value)}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <p className="text-muted-foreground text-sm">Todavía no has dibujado tu firma.</p>
      )}
      <Button
        type="button"
        variant="outline"
        isDisabled={disabled}
        onPress={() => {
          setDraft(value)
          setOpen(true)
        }}
      >
        {isEstimateSignature(value) ? 'Editar firma' : 'Dibujar firma'}
      </Button>
      <DialogRoot open={open} onOpenChange={setOpen}>
        <DialogContent className="app-dialog w-full">
          <DialogHeader>
            <DialogTitle>Firma del cliente</DialogTitle>
            <DialogDescription>
              Dibuja tu firma con el dedo, un lápiz o el ratón. Se guardará al aceptar el
              presupuesto.
            </DialogDescription>
          </DialogHeader>
          <EstimateSignatureSurface value={draft} onChange={setDraft} disabled={disabled} />
          <DialogFooter>
            <Button type="button" variant="outline" onPress={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              isDisabled={disabled || !isEstimateSignature(draft)}
              onPress={() => {
                onChange(draft)
                setOpen(false)
              }}
            >
              Usar firma
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </div>
  )
}

function EstimateSignatureSurface({
  value,
  onChange,
  disabled = false,
}: {
  value: EstimateSignature
  onChange: (signature: EstimateSignature) => void
  disabled?: boolean
}) {
  const pointer = useRef<number | null>(null)
  const signature = useRef(value)
  useEffect(() => {
    signature.current = value
  }, [value])

  function change(next: EstimateSignature) {
    signature.current = next
    onChange(next)
  }

  function point(event: React.PointerEvent<SVGSVGElement>): EstimateSignaturePoint | undefined {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    }
  }

  function start(event: React.PointerEvent<SVGSVGElement>) {
    if (
      disabled ||
      pointer.current !== null ||
      (event.pointerType === 'mouse' && event.button !== 0) ||
      estimateSignaturePointCount(signature.current) >= estimateSignatureLimits.points ||
      signature.current.length >= estimateSignatureLimits.strokes
    )
      return
    const nextPoint = point(event)
    if (!nextPoint) return
    event.preventDefault()
    pointer.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    change([...signature.current, [nextPoint]])
  }

  function move(event: React.PointerEvent<SVGSVGElement>) {
    if (
      pointer.current !== event.pointerId ||
      disabled ||
      estimateSignaturePointCount(signature.current) >= estimateSignatureLimits.points
    )
      return
    const nextPoint = point(event)
    if (!nextPoint) return
    event.preventDefault()
    const next = [...signature.current]
    const lastStroke = next.at(-1)
    if (lastStroke) next[next.length - 1] = [...lastStroke, nextPoint]
    change(next)
  }

  function stop(event: React.PointerEvent<SVGSVGElement>) {
    if (pointer.current === event.pointerId) pointer.current = null
  }

  return (
    <div className="space-y-2">
      <svg
        viewBox="0 0 600 160"
        preserveAspectRatio="none"
        role="img"
        aria-label="Área para dibujar tu firma"
        aria-describedby="estimate-signature-help"
        className="border-border bg-background h-[clamp(5rem,28dvh,14rem)] w-full touch-none rounded-md border"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
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
          Si no puedes dibujar la firma, solicita una alternativa a la empresa.
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          isDisabled={disabled || value.length === 0}
          onPress={() => change([])}
        >
          Borrar firma
        </Button>
      </div>
    </div>
  )
}
