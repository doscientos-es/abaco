import { Button, IconButton } from '@doscientos/ui'
import { PencilSimple } from '@phosphor-icons/react'
import { useState } from 'react'

import { fuzzySearch, normalizeSearchText } from '@/shared/domain/fuzzy-search'
import { TextField } from '@/shared/ui/form'

import type { StaffPerson } from '../domain/staff-schedule'
import { selectedStaffIds, type StaffSelection, type StaffTeam } from '../domain/staff-selection'

const pageSize = 20

function searchOptions<T>(items: T[], query: string, labels: (item: T) => string[]): T[] {
  const exactQuery = normalizeSearchText(query)
  return items
    .filter((item) => fuzzySearch(query, ...labels(item)))
    .map((item) => ({
      item,
      exact: normalizeSearchText(labels(item).join(' ')).includes(exactQuery),
    }))
    .sort((left, right) => Number(right.exact) - Number(left.exact))
    .map(({ item }) => item)
}

export function StaffPeopleFilter({
  people,
  teams,
  selected,
  onChange,
  onEdit,
}: {
  people: StaffPerson[]
  teams: StaffTeam[]
  selected: StaffSelection
  onChange: (selected: StaffSelection) => void
  onEdit: (userId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(pageSize)
  const selectedIds = selectedStaffIds(people, teams, selected)
  const searching = query.trim().length > 0
  const matchingPeople = searching
    ? searchOptions(people, query, (person) => [person.name, person.email ?? ''])
    : []
  const matchingTeams = searching ? searchOptions(teams, query, (team) => [team.name]) : []
  const hasMore = matchingPeople.length > limit || matchingTeams.length > limit

  function toggle(key: keyof StaffSelection, id: string, checked: boolean) {
    const ids = selected[key].filter((value) => value !== id)
    if (checked) ids.push(id)
    onChange({ ...selected, [key]: ids })
  }

  return (
    <div className="w-full space-y-3">
      <TextField
        label="Buscar personas o equipos"
        placeholder="Nombre, correo o nombre del equipo"
        value={query}
        onChange={(value) => {
          setQuery(value)
          setLimit(pageSize)
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm" role="status">
          {selectedIds.size} de {people.length} personas seleccionadas
        </p>
        {selected.personIds.length || selected.teamIds.length ? (
          <Button variant="ghost" onPress={() => onChange({ personIds: [], teamIds: [] })}>
            Limpiar selección
          </Button>
        ) : null}
      </div>
      <div
        className="flex max-h-36 flex-wrap gap-2 overflow-y-auto"
        aria-label="Selección de horarios"
      >
        {teams
          .filter((team) => selected.teamIds.includes(team.id))
          .map((team) => (
            <Button
              key={team.id}
              variant="outline"
              aria-label={`Quitar equipo ${team.name}`}
              onPress={() => toggle('teamIds', team.id, false)}
            >
              Equipo: {team.name} ×
            </Button>
          ))}
        {people
          .filter((person) => selected.personIds.includes(person.userId))
          .map((person) => (
            <Button
              key={person.userId}
              variant="outline"
              aria-label={`Quitar persona ${person.name}`}
              onPress={() => toggle('personIds', person.userId, false)}
            >
              {person.name} ×
            </Button>
          ))}
      </div>
      {searching ? (
        <div className="border-border max-h-80 space-y-3 overflow-y-auto rounded-lg border p-3">
          <p className="text-muted-foreground text-xs" role="status">
            {matchingPeople.length} personas y {matchingTeams.length} equipos encontrados
          </p>
          {matchingTeams.length ? (
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Equipos</legend>
              {matchingTeams.slice(0, limit).map((team) => (
                <label
                  key={team.id}
                  className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md p-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="accent-primary size-4 shrink-0"
                    checked={selected.teamIds.includes(team.id)}
                    onChange={(event) => toggle('teamIds', team.id, event.target.checked)}
                  />
                  <span>
                    {team.name} · {team.memberIds.length} personas
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}
          {matchingPeople.length ? (
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Personas</legend>
              <ul>
                {matchingPeople.slice(0, limit).map((person) => {
                  const fromTeam =
                    selectedIds.has(person.userId) && !selected.personIds.includes(person.userId)
                  return (
                    <li key={person.userId} className="flex items-center gap-1">
                      <label className="hover:bg-muted flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md p-2 text-sm">
                        <input
                          type="checkbox"
                          className="accent-primary size-4 shrink-0"
                          checked={selectedIds.has(person.userId)}
                          disabled={fromTeam}
                          onChange={(event) =>
                            toggle('personIds', person.userId, event.target.checked)
                          }
                        />
                        <span className="min-w-0">
                          <span className="block truncate">{person.name}</span>
                          {person.email ? (
                            <span className="text-muted-foreground block truncate text-xs">
                              {person.email}
                            </span>
                          ) : null}
                          {fromTeam ? (
                            <span className="text-muted-foreground block text-xs">
                              Incluida por un equipo seleccionado
                            </span>
                          ) : null}
                        </span>
                      </label>
                      <IconButton
                        label={`Editar horario de ${person.name}`}
                        variant="ghost"
                        onPress={() => onEdit(person.userId)}
                      >
                        <PencilSimple aria-hidden="true" className="size-4" />
                      </IconButton>
                    </li>
                  )
                })}
              </ul>
            </fieldset>
          ) : null}
          {!matchingPeople.length && !matchingTeams.length ? (
            <p className="text-sm">No hay personas ni equipos que coincidan.</p>
          ) : null}
          {hasMore ? (
            <Button variant="outline" onPress={() => setLimit(limit + pageSize)}>
              Mostrar más resultados
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Busca y selecciona personas o equipos para consultar sus horarios.
        </p>
      )}
    </div>
  )
}
