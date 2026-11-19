import { Button } from '@doscientos/ui'
import { useState } from 'react'

import {
  documentItemNameLimit,
  estimateBlockContentLimit,
  estimateBlockLabels,
  estimateBlockLimit,
  estimateBlockOptions,
  type EstimateBlock,
} from '@/shared/domain/document-library'
import { SelectField, TextareaField, TextField } from '@/shared/ui/form'

const emptyBlock: EstimateBlock = { id: '', name: '', category: 'scope', content: '' }
const categories = Object.entries(estimateBlockLabels).map(([value, label]) => ({ value, label }))

export function EstimateBlockLibrary({
  blocks,
  onChange,
}: {
  blocks: EstimateBlock[]
  onChange: (blocks: EstimateBlock[]) => void
}) {
  const [draft, setDraft] = useState(emptyBlock)
  const valid =
    Boolean(draft.name.trim() && draft.content.trim()) &&
    (Boolean(draft.id) || blocks.length < estimateBlockLimit)

  function commit() {
    if (!valid) return
    const next = {
      ...draft,
      id: draft.id || crypto.randomUUID(),
      name: draft.name.trim(),
      content: draft.content.trim(),
    }
    onChange(
      draft.id ? blocks.map((item) => (item.id === draft.id ? next : item)) : [...blocks, next],
    )
    setDraft(emptyBlock)
  }

  return (
    <section aria-label="Bloques reutilizables" className="border-border space-y-3 border-t pt-4">
      <div>
        <h2 className="text-sm font-semibold">Bloques reutilizables</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Prepara textos para insertarlos después al editar un presupuesto.
        </p>
      </div>
      <SelectField
        label="Editar bloque"
        value={draft.id}
        options={[{ value: '', label: 'Nuevo bloque' }, ...estimateBlockOptions(blocks)]}
        onChange={(id) => setDraft(blocks.find((block) => block.id === id) ?? emptyBlock)}
      />
      <TextField
        label="Nombre del bloque"
        placeholder="Ej. Garantía de instalación"
        value={draft.name}
        maxLength={documentItemNameLimit}
        onChange={(name) => setDraft({ ...draft, name })}
      />
      <SelectField
        label="Categoría"
        value={draft.category}
        options={categories}
        onChange={(value) => setDraft({ ...draft, category: value as EstimateBlock['category'] })}
      />
      <TextareaField
        label="Texto del bloque"
        placeholder="Escribe el texto que se insertará en el presupuesto"
        value={draft.content}
        maxLength={estimateBlockContentLimit}
        onChange={(content) => setDraft({ ...draft, content })}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" isDisabled={!valid} onPress={commit}>
          {draft.id ? 'Actualizar bloque' : 'Añadir bloque'}
        </Button>
        {draft.id ? (
          <Button
            size="sm"
            variant="ghost"
            onPress={() => {
              onChange(blocks.filter(({ id }) => id !== draft.id))
              setDraft(emptyBlock)
            }}
          >
            Quitar bloque
          </Button>
        ) : null}
      </div>
      {blocks.length >= estimateBlockLimit ? (
        <p className="text-muted-foreground text-xs">Máximo de bloques alcanzado.</p>
      ) : null}
    </section>
  )
}
