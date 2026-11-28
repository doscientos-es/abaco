import { Button } from '@doscientos/ui'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import type {
  DirectoryPreviewRow,
  DirectoryTarget,
  ImportOutcome,
} from '../domain/directory-workbook'

const targetLabel: Record<DirectoryTarget, string> = { client: 'Clientes', location: 'Centros' }

export function DirectoryImportRows<T extends { target: DirectoryTarget; line: number }>({
  rows,
  children,
}: {
  rows: T[]
  children: (row: T) => ReactNode
}) {
  const [page, setPage] = useState(0)
  const pageHeading = useRef<HTMLHeadingElement>(null)
  const previous = useRef(0)
  useEffect(() => {
    if (page !== previous.current) pageHeading.current?.focus()
    previous.current = page
  }, [page])
  if (!rows.length) return null
  const start = page * 12
  const visible = rows.slice(start, start + 12)
  return (
    <div className="min-w-0 space-y-2">
      <h3 tabIndex={-1} ref={pageHeading} className="text-sm font-medium">
        Filas {start + 1} a {start + visible.length} de {rows.length}
      </h3>
      <ul className="border-border grid gap-2 rounded-lg border p-2">
        {visible.map((row) => (
          <li
            key={`${row.target}:${row.line}`}
            className="bg-muted/50 rounded p-2 text-sm break-words"
          >
            <b>
              {targetLabel[row.target]} · fila {row.line}
            </b>
            : {children(row)}
          </li>
        ))}
      </ul>
      {rows.length > 12 ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            isDisabled={page === 0}
            onPress={() => setPage(page - 1)}
          >
            Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            isDisabled={start + 12 >= rows.length}
            onPress={() => setPage(page + 1)}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </div>
  )
}
export function previewRowText(row: DirectoryPreviewRow) {
  if ('message' in row) return `Omitida: ${row.message}`
  const { draft } = row
  const details =
    draft.target === 'client'
      ? [draft.values.taxId, draft.values.email]
      : [draft.values.address, draft.values.city, draft.values.postalCode]
  const parent =
    draft.target === 'location'
      ? ` → ${draft.parent.kind === 'existing' ? draft.parent.name : draft.parent.sourceKey}`
      : ''
  return [`Lista: ${draft.values.name} (${draft.key})${parent}`, ...details.filter(Boolean)].join(
    ' · ',
  )
}
export const resultText: Record<ImportOutcome['status'], string> = {
  created: 'Creada y confirmada',
  repeated: 'ID ya importado; no se modificó',
  collision: 'Posible duplicado; no se creó',
  invalid_parent: 'Cliente de destino no válido; no se creó',
  dependency: 'Cliente nuevo no confirmado; no se creó',
  unknown: 'Resultado no confirmado; comprueba el directorio antes de reintentar',
  'not-attempted': 'No se intentó',
}
