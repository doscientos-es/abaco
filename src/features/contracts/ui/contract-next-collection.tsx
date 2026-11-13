import type { ContractNextCollection } from '../domain/contract-collection'

export function ContractNextCollectionCell({
  collection,
}: {
  collection: ContractNextCollection | null
}) {
  if (!collection) {
    return <span className="text-muted-foreground">Sin cobro programado</span>
  }
  const [year, month, day] = collection.due_on.split('-')
  return (
    <div className="space-y-1">
      <time dateTime={collection.due_on} className="font-medium tabular-nums">
        {day}/{month}/{year}
      </time>
      <p
        className={
          collection.is_overdue ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'
        }
      >
        {collection.source === 'draft'
          ? collection.is_overdue
            ? 'Borrador · fecha vencida'
            : 'Borrador · pendiente de emitir'
          : collection.is_overdue
            ? 'Vencido · pendiente de cobro'
            : 'Pendiente de cobro'}
      </p>
    </div>
  )
}
