import { Button } from '@doscientos/ui'
import { Sparkle } from '@phosphor-icons/react'

import { formatEuros } from '@/shared/domain/money'

import { isCompleteEstimateSuggestion, type EstimateSuggestion } from '../domain/suggestions'

/** A suggestion is never applied until the user explicitly confirms it. */
export function EstimateSuggestionPreview({
  suggestion,
  onApply,
  disabled = false,
}: {
  suggestion: EstimateSuggestion
  onApply: () => void
  disabled?: boolean
}) {
  const complete = suggestion.lines.filter(isCompleteEstimateSuggestion).length
  const incomplete = suggestion.lines.length - complete

  return (
    <section
      aria-label="Propuesta de presupuesto"
      className="border-border bg-card min-w-0 space-y-4 rounded-2xl border p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-xl">
          <Sparkle aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold">Tu propuesta</h3>
          <p className="text-muted-foreground text-sm break-words whitespace-pre-wrap">
            {suggestion.message}
          </p>
        </div>
      </div>

      {suggestion.lines.length ? (
        <ul className="divide-border divide-y rounded-xl border">
          {suggestion.lines.map((line, index) => (
            <li
              key={index}
              className="flex min-w-0 flex-wrap items-start justify-between gap-2 p-3"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium break-words">
                  {line.description ?? 'Descripción pendiente'}
                </p>
                {line.details ? (
                  <p className="text-muted-foreground text-xs break-words">{line.details}</p>
                ) : null}
                <p className="text-muted-foreground text-xs">
                  {line.quantity === null ? 'Cantidad pendiente' : line.quantity}{' '}
                  {line.unit ?? '· unidad pendiente'}
                  {!line.kind ? ' · tipo pendiente' : ''}
                </p>
              </div>
              <p className="shrink-0 text-right text-sm font-medium tabular-nums">
                {line.unitPriceCents === null
                  ? 'Precio pendiente'
                  : `${formatEuros(line.unitPriceCents)} / ${line.unit ?? 'unidad'}`}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {incomplete ? (
        <p className="text-muted-foreground text-xs">
          {incomplete === 1 ? 'Una partida necesita' : `${incomplete} partidas necesitan`} más
          datos. No se añadirán precios ni cantidades inventados.
        </p>
      ) : null}
      {complete ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            Se añadirán como partidas nuevas; no sustituyen las ya añadidas. Revísalas antes de
            guardar.
          </p>
          <Button type="button" onPress={onApply} isDisabled={disabled}>
            Añadir {complete === 1 ? '1 partida' : `${complete} partidas`}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
