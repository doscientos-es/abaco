import { IconButton, TableCell } from '@doscientos/ui'
import { PencilSimple, Trash } from '@phosphor-icons/react'

export function RowActions({
  name,
  onEdit,
  onDelete,
}: {
  name: string
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <IconButton label={`Editar ${name}`} variant="outline" onPress={onEdit}>
        <PencilSimple aria-hidden="true" className="size-4" />
      </IconButton>
      <IconButton
        label={`Eliminar ${name}`}
        variant="ghost"
        className="text-destructive"
        onPress={onDelete}
      >
        <Trash aria-hidden="true" className="size-4" />
      </IconButton>
    </div>
  )
}

/** Consistent compact actions for editable data table rows. */
export function TableRowActions({
  name,
  onEdit,
  onDelete,
}: {
  name: string
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <TableCell className="text-right whitespace-nowrap">
      <RowActions name={name} onEdit={onEdit} onDelete={onDelete} />
    </TableCell>
  )
}
