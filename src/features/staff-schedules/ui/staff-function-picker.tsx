import { MultiSelectField } from '@/shared/ui/multi-select-field'

import type { StaffFunction } from '../domain/staff-schedule'

export function StaffFunctionPicker({
  functions,
  selected,
  onChange,
}: {
  functions: StaffFunction[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <fieldset className="min-w-0 sm:col-span-2">
      <legend className="mb-2 font-medium">Funciones</legend>
      {functions.length ? (
        <MultiSelectField
          label="Funciones asignadas"
          options={functions.map((item) => ({ value: item.id, label: item.name }))}
          value={selected}
          onChange={onChange}
        />
      ) : (
        <p className="text-muted-foreground text-sm">Crea funciones en Personalizar → Listas.</p>
      )}
    </fieldset>
  )
}
