import { Button } from '@doscientos/ui'
import { useState } from 'react'

import {
  documentItemNameLimit,
  namedDocumentOptions,
  templateLimit,
} from '@/shared/domain/document-library'
import { SelectField, TextField } from '@/shared/ui/form'

type Named = { id: string; name: string }

export function useDocumentTemplates<T extends Named>(
  items: T[],
  defaultId: string | null,
  onChange: (items: T[], defaultId: string | null) => void,
) {
  const [id, select] = useState(defaultId ?? '')
  const selected = items.find((item) => item.id === id)
  return {
    selected,
    select,
    update: (next: T) =>
      onChange(
        items.map((item) => (item.id === next.id ? next : item)),
        defaultId,
      ),
    controls: {
      items,
      selected: selected?.id ?? '',
      defaultId,
      onSelect: select,
      onDefault: () => onChange(items, selected?.id ?? null),
      onDelete: () => {
        if (!selected) return
        const nextDefault = defaultId === selected.id ? null : defaultId
        onChange(
          items.filter((item) => item.id !== selected.id),
          nextDefault,
        )
        select(nextDefault ?? '')
      },
      onRename: (name: string) => {
        if (!selected) return
        onChange(
          items.map((item) => (item.id === selected.id ? { ...item, name } : item)),
          defaultId,
        )
      },
      onCreate: (next: T) => {
        onChange([...items, next], defaultId)
        select(next.id)
      },
    },
  }
}

export function DocumentTemplatesEditor({
  items,
  selected,
  defaultId,
  onSelect,
  onDefault,
  onDelete,
  onCreate,
  onRename,
}: {
  items: readonly Named[]
  selected: string
  defaultId: string | null
  onSelect: (id: string) => void
  onDefault: () => void
  onDelete: () => void
  onCreate: (name: string) => void
  onRename: (name: string) => void
}) {
  const [name, setName] = useState('')
  const trimmed = name.trim()
  const available =
    trimmed &&
    !items.some((item) => item.name.toLocaleLowerCase('es') === trimmed.toLocaleLowerCase('es'))
  const isDefault = (selected || null) === defaultId

  function commit(action: (value: string) => void) {
    action(trimmed)
    setName('')
  }

  return (
    <div className="border-border space-y-3 rounded-lg border p-3">
      <SelectField
        label="Plantillas guardadas"
        value={selected}
        options={[
          {
            value: '',
            label: defaultId ? 'Diseño base de la empresa' : 'Diseño base · Por defecto',
          },
          ...namedDocumentOptions(items, defaultId),
        ]}
        onChange={(value) => {
          onSelect(value)
          setName('')
        }}
      />
      <div className="flex flex-wrap gap-2">
        {isDefault ? (
          <p className="text-muted-foreground text-xs">
            Se aplicará por defecto a los documentos nuevos.
          </p>
        ) : (
          <Button variant="outline" size="sm" onPress={onDefault}>
            Usar por defecto
          </Button>
        )}
        {selected ? (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              onDelete()
              setName('')
            }}
          >
            Quitar plantilla
          </Button>
        ) : null}
      </div>
      <TextField
        label="Nombre de la plantilla"
        value={name}
        maxLength={documentItemNameLimit}
        placeholder="Ej. Mantenimiento anual"
        onChange={setName}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          isDisabled={!available || items.length >= templateLimit}
          onPress={() => commit(onCreate)}
        >
          Crear copia
        </Button>
        {selected ? (
          <Button
            variant="ghost"
            size="sm"
            isDisabled={!available}
            onPress={() => commit(onRename)}
          >
            Renombrar plantilla
          </Button>
        ) : null}
      </div>
      {items.length >= templateLimit ? (
        <p className="text-muted-foreground text-xs">Máximo de plantillas alcanzado.</p>
      ) : null}
    </div>
  )
}
