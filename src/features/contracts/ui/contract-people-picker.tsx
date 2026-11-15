export function ContractPeoplePicker({
  people,
  selected,
  disabled = false,
  onChange,
}: {
  people: Array<{ id: string; label: string }>
  selected: string[]
  disabled?: boolean
  onChange: (ids: string[]) => void
}) {
  return (
    <fieldset disabled={disabled} className="space-y-2 rounded-lg border p-3 sm:col-span-2">
      <legend className="px-1 text-sm font-medium">Personas asignadas · {selected.length}</legend>
      <div className="max-h-48 space-y-1 overflow-y-auto">
        {people.map((person) => (
          <label
            key={person.id}
            className="hover:bg-muted flex items-center gap-2 rounded-md p-2 text-sm"
          >
            <input
              type="checkbox"
              checked={selected.includes(person.id)}
              disabled={disabled || (!selected.includes(person.id) && selected.length >= 30)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, person.id]
                    : selected.filter((id) => id !== person.id),
                )
              }
            />
            {person.label}
          </label>
        ))}
        {!people.length ? (
          <p className="text-muted-foreground text-sm">No hay personas disponibles.</p>
        ) : null}
      </div>
    </fieldset>
  )
}
