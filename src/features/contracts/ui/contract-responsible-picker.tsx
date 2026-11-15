import { MultiSelectField } from '@/shared/ui/multi-select-field'

type Person = { id: string; label: string }
type Selection = { people: string[]; team: string | null }

export function ContractResponsiblePicker({
  people,
  visiblePeople,
  selected,
  disabled,
  onChange,
}: {
  people: Person[]
  visiblePeople: Person[]
  selected: Selection
  disabled: boolean
  onChange: (selection: Selection) => void
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4 sm:col-span-2">
      <legend className="mb-2 text-sm font-semibold">Responsables del contrato</legend>
      <MultiSelectField
        label="Trabajadores"
        options={visiblePeople.map((person) => ({ value: person.id, label: person.label }))}
        value={selected.people}
        maxSelections={30}
        isDisabled={disabled}
        onChange={(ids) => onChange({ people: ids, team: ids.length ? null : selected.team })}
      />
      {selected.people.length ? (
        <div className="flex flex-wrap gap-2" aria-label="Trabajadores seleccionados">
          {selected.people.map((id) => {
            const name = people.find((person) => person.id === id)?.label ?? 'Persona no disponible'
            return (
              <button
                key={id}
                type="button"
                aria-label={`Quitar ${name}`}
                className="bg-background hover:bg-muted rounded-full border px-3 py-1 text-xs"
                onClick={() =>
                  onChange({ people: selected.people.filter((item) => item !== id), team: null })
                }
              >
                {name} ×
              </button>
            )
          })}
        </div>
      ) : null}
      <p className="text-muted-foreground text-xs">Puedes asignar hasta 30 trabajadores.</p>
      {selected.team ? (
        <p className="text-muted-foreground text-xs">
          El contrato conserva un equipo asignado anteriormente. Si seleccionas trabajadores, lo
          sustituirán.
        </p>
      ) : null}
    </fieldset>
  )
}
