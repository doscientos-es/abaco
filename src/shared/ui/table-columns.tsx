import { Button, Checkbox, IconButton, Popover, TableHead } from '@doscientos/ui'
import { ArrowDown, ArrowUp, SlidersHorizontal } from '@phosphor-icons/react'
import { Fragment, useState, type ReactNode } from 'react'

import {
  moveTableColumn,
  readColumnPreferences,
  resolveColumnPreferences,
  writeColumnPreferences,
  type ColumnPreferences,
  type TableColumn,
} from './table-column-preferences'

export function useTableColumns(key: string, definitions: readonly TableColumn[]) {
  const storageKey = `abaco:table-columns:v1:${key}`
  const [stored, setStored] = useState(() => readColumnPreferences(storageKey, definitions))
  const preferences = resolveColumnPreferences(definitions, stored)
  const ordered = preferences.order
    .map((id) => definitions.find((column) => column.id === id))
    .filter((column): column is TableColumn => Boolean(column && column.available !== false))
  const visible = ordered.filter((column) => !preferences.hidden.includes(column.id))
  const commit = (next: ColumnPreferences) => {
    setStored(next)
    writeColumnPreferences(storageKey, next)
  }
  return {
    ordered,
    visible,
    preferences,
    commit,
    reset: () => commit(resolveColumnPreferences(definitions, null)),
  }
}

type ColumnController = ReturnType<typeof useTableColumns>

/** The fixed actions header also holds the accessible configuration trigger. */
export function TableColumnsHeader({
  columns,
  tableName,
}: {
  columns: ColumnController
  tableName: string
}) {
  return (
    <>
      {columns.visible.map((column) => (
        <TableHead key={column.id} className={column.headClassName}>
          {column.label}
        </TableHead>
      ))}
      <TableHead className="text-right whitespace-nowrap">
        <span className="mr-2">Acciones</span>
        <Popover
          placement="bottom end"
          title="Personalizar columnas"
          description="Elige las columnas y cambia su orden en este navegador."
          className="max-h-[80dvh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto"
          trigger={
            <IconButton label={`Personalizar columnas de ${tableName}`} variant="ghost">
              <SlidersHorizontal aria-hidden="true" className="size-4" />
            </IconButton>
          }
        >
          <ul className="space-y-1">
            {columns.ordered.map((column, index) => (
              <li key={column.id} className="flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <Checkbox
                    isSelected={!columns.preferences.hidden.includes(column.id)}
                    isDisabled={column.required}
                    onChange={(selected) =>
                      columns.commit({
                        ...columns.preferences,
                        hidden: selected
                          ? columns.preferences.hidden.filter((id) => id !== column.id)
                          : [...columns.preferences.hidden, column.id],
                      })
                    }
                  >
                    {column.label}
                  </Checkbox>
                </div>
                <IconButton
                  label={`Subir ${column.label}`}
                  variant="ghost"
                  isDisabled={index === 0}
                  onPress={() =>
                    columns.commit(
                      moveTableColumn(
                        columns.preferences,
                        column.id,
                        -1,
                        columns.ordered.map((item) => item.id),
                      ),
                    )
                  }
                >
                  <ArrowUp aria-hidden="true" className="size-4" />
                </IconButton>
                <IconButton
                  label={`Bajar ${column.label}`}
                  variant="ghost"
                  isDisabled={index === columns.ordered.length - 1}
                  onPress={() =>
                    columns.commit(
                      moveTableColumn(
                        columns.preferences,
                        column.id,
                        1,
                        columns.ordered.map((item) => item.id),
                      ),
                    )
                  }
                >
                  <ArrowDown aria-hidden="true" className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" onPress={columns.reset}>
            Restaurar columnas
          </Button>
        </Popover>
      </TableHead>
    </>
  )
}

export function TableColumnsCells({
  columns,
  cells,
}: {
  columns: ColumnController
  cells: Record<string, ReactNode>
}) {
  return (
    <>
      {columns.visible.map((column) => (
        <Fragment key={column.id}>{cells[column.id]}</Fragment>
      ))}
    </>
  )
}
