import { Button, TableCell } from '@doscientos/ui'

/** Consistent compact actions for editable data table rows. */
export function TableRowActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <TableCell className="text-right whitespace-nowrap">
      <div className="inline-flex items-center gap-1">
        <Button size="sm" variant="outline" onPress={onEdit}>
          Editar
        </Button>
        <Button size="sm" variant="destructive" onPress={onDelete}>
          Eliminar
        </Button>
      </div>
    </TableCell>
  )
}
