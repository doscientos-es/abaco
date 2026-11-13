import { Button } from '@doscientos/ui'
import { useState } from 'react'

import { formLimits } from '@/shared/domain/form-limits'
import { TextareaField, TextField } from '@/shared/ui/form'

/** Adds an editable description to the existing published estimate snapshot. */
export function ServiceProposalAssistant({
  clauses,
  onChange,
}: {
  clauses: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [service, setService] = useState('Limpieza de zonas comunes')
  const [areas, setAreas] = useState('')
  const [tasks, setTasks] = useState('')
  const [frequency, setFrequency] = useState('')
  const [included, setIncluded] = useState('')
  const [extra, setExtra] = useState('')
  const description = [
    `SERVICIO: ${service.trim()}`,
    areas.trim() && `Zonas: ${areas.trim()}`,
    tasks.trim() && `Trabajos incluidos:\n${tasks.trim()}`,
    frequency.trim() && `Frecuencia y horario: ${frequency.trim()}`,
    included.trim() && `Materiales y medios: ${included.trim()}`,
    extra.trim() && `Otras condiciones: ${extra.trim()}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  const result = [clauses.trim(), description].filter(Boolean).join('\n\n')
  const tooLong = result.length > formLimits.estimateClauses

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">Describir un servicio</p>
          <p className="text-muted-foreground text-sm">
            Prepara el alcance con unas preguntas y añádelo al texto editable del presupuesto.
          </p>
        </div>
        <Button variant="outline" onPress={() => setOpen(!open)}>
          {open ? 'Cerrar' : 'Añadir descripción'}
        </Button>
      </div>
      {open ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Servicio"
            value={service}
            onChange={setService}
            placeholder="Limpieza, jardinería…"
          />
          <TextField
            label="Zonas"
            value={areas}
            onChange={setAreas}
            placeholder="Portales, escaleras, garaje…"
          />
          <TextareaField
            label="Trabajos incluidos"
            value={tasks}
            onChange={setTasks}
            placeholder="Describe las tareas que se realizarán"
          />
          <TextareaField
            label="Frecuencia y horario"
            value={frequency}
            onChange={setFrequency}
            placeholder="Por ejemplo, portales de lunes a viernes y garaje mensual"
          />
          <TextareaField
            label="Materiales y medios"
            value={included}
            onChange={setIncluded}
            placeholder="Solo lo que esté incluido en la oferta"
          />
          <TextareaField
            label="Otras condiciones"
            value={extra}
            onChange={setExtra}
            placeholder="Exclusiones, personal o detalles acordados"
          />
          <div className="sm:col-span-2">
            <p className="mb-1 text-sm font-medium">Así aparecerá</p>
            <p className="bg-surface-subtle rounded-lg p-3 text-sm whitespace-pre-line">
              {description}
            </p>
          </div>
          {tooLong ? (
            <p role="alert" className="text-destructive text-sm sm:col-span-2">
              El texto supera el límite de {formLimits.estimateClauses} caracteres. Reduce el
              contenido antes de añadirlo.
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <Button
              isDisabled={!service.trim() || tooLong}
              onPress={() => {
                onChange(result)
                setService('')
                setAreas('')
                setTasks('')
                setFrequency('')
                setIncluded('')
                setExtra('')
                setOpen(false)
              }}
            >
              Añadir al presupuesto
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
