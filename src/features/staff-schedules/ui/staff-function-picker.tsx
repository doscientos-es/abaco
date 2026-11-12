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
        <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
          {functions.map((item) => (
            <label key={item.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, item.id]
                      : selected.filter((id) => id !== item.id),
                  )
                }
              />
              {item.name}
            </label>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Crea funciones en Personalizar → Listas.</p>
      )}
    </fieldset>
  )
}
