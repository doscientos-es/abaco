import { Button, IconButton, Popover } from '@doscientos/ui'
import { CaretDown, PencilSimple } from '@phosphor-icons/react'
import { useState } from 'react'

import type { StaffPerson } from '../domain/staff-schedule'

export function StaffPeopleFilter({
  people,
  selected,
  onChange,
  onEdit,
}: {
  people: StaffPerson[]
  selected: string[] | null
  onChange: (selected: string[] | null) => void
  onEdit: (userId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedPeople =
    selected === null ? people : people.filter((p) => selected.includes(p.userId))
  const allSelected =
    selected === null || (people.length > 0 && selectedPeople.length === people.length)
  const summary = allSelected
    ? 'Todas'
    : selectedPeople.length === 0
      ? 'Ninguna'
      : selectedPeople.length === 1
        ? selectedPeople[0]?.name
        : `${selectedPeople.length} personas`

  function togglePerson(userId: string, checked: boolean) {
    const ids = selectedPeople.map((person) => person.userId).filter((id) => id !== userId)
    if (checked) ids.push(userId)
    onChange(people.length > 0 && ids.length === people.length ? null : ids)
  }

  return (
    <Popover
      isOpen={open}
      onOpenChange={setOpen}
      placement="bottom start"
      className="max-h-[min(24rem,70dvh)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto p-2"
      trigger={
        <Button
          variant="outline"
          aria-label={`Personas: ${summary}`}
          className="justify-between gap-3"
        >
          <span className="max-w-48 truncate">Personas: {summary}</span>
          <CaretDown aria-hidden="true" className="size-4" />
        </Button>
      }
    >
      <fieldset>
        <legend className="sr-only">Filtrar personas</legend>
        <label className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary size-4"
            checked={allSelected}
            onChange={(event) => onChange(event.target.checked ? null : [])}
          />
          Todas
        </label>
        <ul className="border-border border-t">
          {people.map((person) => (
            <li key={person.userId} className="flex items-center gap-1">
              <label className="hover:bg-muted flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary size-4 shrink-0"
                  checked={selected === null || selected.includes(person.userId)}
                  onChange={(event) => togglePerson(person.userId, event.target.checked)}
                />
                <span className="truncate">{person.name}</span>
              </label>
              <IconButton
                label={`Editar horario de ${person.name}`}
                variant="ghost"
                onPress={() => {
                  setOpen(false)
                  onEdit(person.userId)
                }}
              >
                <PencilSimple aria-hidden="true" className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      </fieldset>
    </Popover>
  )
}
