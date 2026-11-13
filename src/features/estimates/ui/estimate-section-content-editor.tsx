import { Button, IconButton } from '@doscientos/ui'
import { Trash } from '@phosphor-icons/react'

import { estimateSectionLimits, type EstimateSection } from '@/shared/domain/estimate-document'
import { newId } from '@/shared/store/store'
import { TextareaField, TextField } from '@/shared/ui/form'

import { EstimateServicesEditor } from './estimate-services-editor'

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
      return <EstimateServicesEditor section={section} onChange={onChange} />
  }
}
