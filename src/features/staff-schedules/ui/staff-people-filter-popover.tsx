import { Button, Popover } from '@doscientos/ui'
import { CaretDown } from '@phosphor-icons/react'
import { useState, type ComponentProps } from 'react'

import { selectedStaffIds } from '../domain/staff-selection'
import { StaffPeopleFilter } from './staff-people-filter'

export function StaffPeopleFilterPopover(props: ComponentProps<typeof StaffPeopleFilter>) {
  const [open, setOpen] = useState(false)
  const selectedCount = selectedStaffIds(props.people, props.teams, props.selected).size

  return (
    <Popover
      isOpen={open}
      onOpenChange={setOpen}
      placement="bottom start"
      aria-label="Seleccionar personas y equipos"
      className="max-h-[80dvh] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto p-4"
      trigger={
        <Button variant="outline" className="h-9 min-w-0 flex-1 justify-between px-3 sm:flex-none">
          <span className="truncate">
            Personas y equipos · {selectedCount} de {props.people.length}
          </span>
          <CaretDown aria-hidden="true" className="size-3 shrink-0" />
        </Button>
      }
    >
      <StaffPeopleFilter
        {...props}
        onEdit={
          props.onEdit
            ? (id) => {
                setOpen(false)
                props.onEdit?.(id)
              }
            : undefined
        }
      />
    </Popover>
  )
}
