import { Button, IconButton } from '@doscientos/ui'
import { Trash } from '@phosphor-icons/react'

import { estimateSectionLimits, type EstimateSection } from '@/shared/domain/estimate-document'
import { newId } from '@/shared/store/store'
import { TextareaField, TextField } from '@/shared/ui/form'

export function EstimateSectionContentEditor({
  section,
  onChange,
}: {
  section: Exclude<EstimateSection, { type: 'prices' }>
  onChange: (section: EstimateSection) => void
}) {
  switch (section.type) {
    case 'description':
      return (
        <TextareaField
          label="Contenido"
          placeholder="Describe el servicio, el alcance o las condiciones…"
          value={section.content}
          maxLength={estimateSectionLimits.text}
          onChange={(content) => onChange({ ...section, content })}
        />
      )
    case 'list':
      return (
        <div className="space-y-3">
          {section.items.map((item, index) => (
            <div key={item.id} className="flex items-end gap-2">
              <TextField
                label={`Elemento ${index + 1}`}
                placeholder="Escribe un elemento de la lista"
                className="min-w-0 flex-1"
                value={item.text}
                maxLength={estimateSectionLimits.item}
                onChange={(text) =>
                  onChange({
                    ...section,
                    items: section.items.map((row) =>
                      row.id === item.id ? { ...row, text } : row,
                    ),
                  })
                }
              />
              <IconButton
                label={`Eliminar elemento ${index + 1}`}
                variant="ghost"
                onPress={() =>
                  onChange({ ...section, items: section.items.filter((row) => row.id !== item.id) })
                }
              >
                <Trash aria-hidden="true" className="size-4" />
              </IconButton>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            isDisabled={section.items.length >= estimateSectionLimits.rows}
            onPress={() =>
              onChange({ ...section, items: [...section.items, { id: newId(), text: '' }] })
            }
          >
            Añadir elemento
          </Button>
        </div>
      )
    case 'work_table':
      return (
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs">
            Describe el plan acordado. Esta tabla no programa visitas ni cambia la facturación.
          </p>
          {section.rows.map((row, index) => (
            <div
              key={row.id}
              className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_auto]"
            >
              <TextField
                label={`Trabajo ${index + 1}`}
                placeholder="Ej. Limpieza de cristales"
                value={row.task}
                maxLength={estimateSectionLimits.item}
                onChange={(task) =>
                  onChange({
                    ...section,
                    rows: section.rows.map((item) =>
                      item.id === row.id ? { ...item, task } : item,
                    ),
                  })
                }
              />
              <TextField
                label={`Frecuencia del trabajo ${index + 1}`}
                placeholder="Ej. Cada semana"
                value={row.frequency}
                maxLength={200}
                onChange={(frequency) =>
                  onChange({
                    ...section,
                    rows: section.rows.map((item) =>
                      item.id === row.id ? { ...item, frequency } : item,
                    ),
                  })
                }
              />
              <TextField
                label={`Detalle del trabajo ${index + 1}`}
                placeholder="Zona, medios o instrucciones"
                value={row.notes}
                maxLength={estimateSectionLimits.item}
                onChange={(notes) =>
                  onChange({
                    ...section,
                    rows: section.rows.map((item) =>
                      item.id === row.id ? { ...item, notes } : item,
                    ),
                  })
                }
              />
              <IconButton
                label={`Eliminar trabajo ${index + 1}`}
                variant="ghost"
                onPress={() =>
                  onChange({ ...section, rows: section.rows.filter((item) => item.id !== row.id) })
                }
              >
                <Trash aria-hidden="true" className="size-4" />
              </IconButton>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            isDisabled={section.rows.length >= estimateSectionLimits.rows}
            onPress={() =>
              onChange({
                ...section,
                rows: [...section.rows, { id: newId(), task: '', frequency: '', notes: '' }],
              })
            }
          >
            Añadir trabajo
          </Button>
        </div>
      )
  }
}
