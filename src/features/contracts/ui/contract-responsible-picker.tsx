import { useState } from 'react'

type Person = { id: string; label: string }
type Team = { id: string; name: string; archived: boolean }
type Selection = { people: string[]; team: string | null }

function matches(text: string, query: string) {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
  return normalize(text).includes(normalize(query.trim()))
}

export function ContractResponsiblePicker({
  people,
  teams,
  selected,
  disabled,
  onChange,
}: {
  people: Person[]
  teams: Team[]
  selected: Selection
  disabled: boolean
  onChange: (selection: Selection) => void
}) {
  const [search, setSearch] = useState('')
  const visiblePeople = people.filter((person) => matches(person.label, search))
  const visibleTeams = teams.filter((team) => !team.archived && matches(team.name, search))
  const selectedTeam = teams.find((team) => team.id === selected.team)
  return (
    <fieldset
      disabled={disabled}
      className="bg-muted/20 space-y-3 rounded-xl border p-4 sm:col-span-2"
    >
      <legend className="px-1 text-sm font-semibold">Responsables</legend>
      <div className="flex flex-wrap gap-2" aria-label="Responsables seleccionados">
        {selected.people.map((id) => {
          const name = people.find((person) => person.id === id)?.label ?? 'Persona no disponible'
          return (
            <button
              key={id}
              type="button"
              aria-label={`Quitar ${name}`}
              className="bg-background rounded-full border px-3 py-1 text-sm"
              onClick={() =>
                onChange({ people: selected.people.filter((item) => item !== id), team: null })
              }
            >
              {name} ×
            </button>
          )
        })}
        {selected.team ? (
          <button
            type="button"
            aria-label={`Quitar equipo ${selectedTeam?.name ?? 'no disponible'}`}
            className="bg-background rounded-full border px-3 py-1 text-sm"
            onClick={() => onChange({ people: [], team: null })}
          >
            Equipo: {selectedTeam?.name ?? 'No disponible'}
            {selectedTeam?.archived ? ' (archivado)' : ''} ×
          </button>
        ) : null}
        {!selected.people.length && !selected.team ? (
          <span className="text-muted-foreground text-sm">Sin asignar</span>
        ) : null}
      </div>
      <details>
        <summary className="text-primary cursor-pointer text-sm font-medium">
          Buscar personas o equipos
        </summary>
        <label className="mt-3 block text-sm">
          Buscar por nombre
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="bg-background mt-1 w-full rounded-md border p-2"
            placeholder="Nombre de persona o equipo"
          />
        </label>
        <div
          className="bg-background mt-2 max-h-48 overflow-y-auto rounded-md border"
          aria-label="Resultados de responsables"
        >
          {visiblePeople.slice(0, 50).map((person) => (
            <label key={person.id} className="hover:bg-muted flex items-center gap-2 p-2 text-sm">
              <input
                type="checkbox"
                checked={selected.people.includes(person.id)}
                disabled={!selected.people.includes(person.id) && selected.people.length >= 30}
                onChange={(event) =>
                  onChange({
                    people: event.target.checked
                      ? [...selected.people, person.id]
                      : selected.people.filter((id) => id !== person.id),
                    team: null,
                  })
                }
              />
              {person.label} <span className="text-muted-foreground">· Persona</span>
            </label>
          ))}
          {visibleTeams.slice(0, 50).map((team) => (
            <label key={team.id} className="hover:bg-muted flex items-center gap-2 p-2 text-sm">
              <input
                type="checkbox"
                checked={selected.team === team.id}
                onChange={(event) =>
                  onChange({ people: [], team: event.target.checked ? team.id : null })
                }
              />
              {team.name} <span className="text-muted-foreground">· Equipo</span>
            </label>
          ))}
          {!visiblePeople.length && !visibleTeams.length ? (
            <p className="text-muted-foreground p-2 text-sm">No hay resultados.</p>
          ) : null}
          {visiblePeople.length > 50 || visibleTeams.length > 50 ? (
            <p className="text-muted-foreground p-2 text-sm">
              Escribe más para reducir los resultados.
            </p>
          ) : null}
        </div>
      </details>
      <p className="text-muted-foreground text-xs">
        Hasta 30 personas o un equipo. Al elegir uno se sustituye la selección anterior del otro
        tipo.
      </p>
    </fieldset>
  )
}
