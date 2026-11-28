import { Button, Card } from '@doscientos/ui'
import { CaretDownIcon, FlaskIcon } from '@phosphor-icons/react'
import { useEffect, useId, useReducer, useRef } from 'react'

import {
  initialPractice,
  PRACTICE_NOTE_LIMIT,
  practiceReducer,
  practiceVisits,
} from '../domain/technician-practice'

const visitIds = [
  'climatizacion',
  'iluminacion',
] as const satisfies readonly (keyof typeof practiceVisits)[]

const steps = {
  choose: { position: 1, title: 'Elige una visita ficticia' },
  inspect: { position: 2, title: 'Revisa la visita' },
  draft: { position: 3, title: 'Rellena el parte de ejemplo' },
  result: { position: 4, title: 'Resultado de la simulación' },
} as const

export function TechnicianPractice() {
  const [state, dispatch] = useReducer(practiceReducer, initialPractice)
  const disclosure = useRef<HTMLDetailsElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const previousStep = useRef(state.step)
  const id = useId()
  const visit = state.step === 'choose' ? null : practiceVisits[state.visitId]

  useEffect(() => {
    if (state.step !== previousStep.current) {
      previousStep.current = state.step
      if (disclosure.current?.open) heading.current?.focus()
    }
  }, [state.step])

  return (
    <Card>
      <details
        ref={disclosure}
        className="group"
        onToggle={(event) => {
          if (!event.currentTarget.open) dispatch({ type: 'reset' })
        }}
      >
        <summary className="focus-visible:ring-ring grid min-h-12 cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-4 py-3 focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          <FlaskIcon size={24} aria-hidden="true" />
          <span>
            <span className="block font-semibold">Práctica guiada para técnicos</span>
            <span className="text-muted-foreground block text-sm">
              Ensaya una visita y su parte sin tocar datos reales.
            </span>
          </span>
          <CaretDownIcon size={18} aria-hidden="true" className="group-open:rotate-180" />
        </summary>
        <div className="border-border space-y-4 border-t px-4 py-5">
          <p className="bg-muted text-muted-foreground rounded-lg p-3 text-sm">
            <strong className="text-foreground">Simulación.</strong> Usa solo datos ficticios. Nada
            se guarda ni se envía, y cerrar la práctica borra lo que hayas escrito.
          </p>
          <div>
            <p className="text-muted-foreground text-xs font-semibold">
              Paso {steps[state.step].position} de 4
            </p>
            <h2
              ref={heading}
              tabIndex={-1}
              className="focus-visible:outline-ring rounded-sm text-lg font-semibold"
            >
              {steps[state.step].title}
            </h2>
          </div>

          {state.step === 'choose' ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {visitIds.map((visitId) => (
                <li key={visitId}>
                  <Button
                    variant="outline"
                    className="min-h-11 w-full whitespace-normal"
                    onPress={() => dispatch({ type: 'choose', visitId })}
                  >
                    {practiceVisits[visitId].title}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          {state.step === 'inspect' && visit ? (
            <div className="space-y-3">
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="font-medium">Visita</dt>
                  <dd>{visit.title}</dd>
                </div>
                <div>
                  <dt className="font-medium">Ubicación</dt>
                  <dd>{visit.site}</dd>
                </div>
                <div>
                  <dt className="font-medium">Motivo de la visita</dt>
                  <dd>{visit.request}</dd>
                </div>
              </dl>
              <Button
                className="min-h-11 w-full sm:w-auto"
                onPress={() => dispatch({ type: 'draft' })}
              >
                Empezar el parte
              </Button>
            </div>
          ) : null}

          {state.step === 'draft' && visit ? (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault()
                dispatch({ type: 'simulate' })
              }}
            >
              <fieldset className="min-w-0 space-y-1">
                <legend className="font-medium">Comprobaciones de la visita</legend>
                {visit.tasks.map((task, index) => (
                  <label
                    key={task}
                    className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="accent-primary size-5 shrink-0"
                      checked={state.checked[index]}
                      onChange={(event) =>
                        dispatch({ type: 'check', index, checked: event.currentTarget.checked })
                      }
                    />
                    {task}
                  </label>
                ))}
              </fieldset>
              <div className="space-y-1">
                <label htmlFor={id} className="block font-medium">
                  Nota del parte
                </label>
                <p id={`${id}-help`} className="text-muted-foreground text-sm">
                  Explica qué hiciste y cómo quedó. Por ejemplo: «{visit.example}»
                </p>
                <textarea
                  id={id}
                  aria-describedby={`${id}-help${state.error && !state.note.trim() ? ` ${id}-error` : ''}`}
                  aria-invalid={state.error && !state.note.trim() ? true : undefined}
                  className="border-input bg-background focus-visible:ring-ring block min-h-24 w-full rounded-md border p-3 text-base focus-visible:ring-2 focus-visible:outline-none"
                  value={state.note}
                  maxLength={PRACTICE_NOTE_LIMIT}
                  onChange={(event) => dispatch({ type: 'note', value: event.currentTarget.value })}
                />
              </div>
              {state.error ? (
                <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
                  {state.error}
                </p>
              ) : null}
              <Button type="submit" className="min-h-11 w-full sm:w-auto">
                Simular envío
              </Button>
            </form>
          ) : null}

          {state.step === 'result' && visit ? (
            <div className="border-border space-y-2 rounded-lg border p-3 text-sm">
              <p className="font-semibold">Parte de ejemplo completado</p>
              <p>No se ha creado ningún parte real ni se ha enviado ningún aviso.</p>
              <p>
                {visit.title} · {state.checked.filter(Boolean).length} de {visit.tasks.length}{' '}
                comprobaciones
              </p>
              <p className="break-words whitespace-pre-wrap">{state.note}</p>
            </div>
          ) : null}

          {state.step !== 'choose' ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full sm:w-auto"
              onPress={() => dispatch({ type: 'reset' })}
            >
              {state.step === 'result' ? 'Hacer otra práctica' : 'Reiniciar práctica'}
            </Button>
          ) : null}
        </div>
      </details>
    </Card>
  )
}
