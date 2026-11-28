import { Button } from '@doscientos/ui'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { roleLabels } from '@/features/auth'

import type { TeamImportOutcome, TeamImportRow } from '../application/team-import'

function PagedImportRows<T extends { line: number }>({
  rows,
  children,
  title,
}: {
  rows: T[]
  children: (row: T) => ReactNode
  title: string
}) {
  const [offset, setOffset] = useState(0)
  const page = rows.slice(offset, offset + 20)
  const heading = useRef<HTMLHeadingElement>(null)
  const lastOffset = useRef(offset)
  useEffect(() => {
    if (lastOffset.current !== offset) heading.current?.focus()
    lastOffset.current = offset
  }, [offset])
  if (!rows.length) return null
  return (
    <section className="min-w-0 space-y-2">
      <h3 ref={heading} tabIndex={-1} className="text-sm font-semibold">
        {title} · filas {offset + 1} a {offset + page.length} de {rows.length}
      </h3>
      <ul className="border-border grid gap-2 rounded-lg border p-2">
        {page.map((row) => (
          <li
            key={row.line}
            className="bg-muted/50 min-w-0 rounded px-2 py-1.5 text-sm break-words"
          >
            <b>Fila {row.line}</b> · {children(row)}
          </li>
        ))}
      </ul>
      {rows.length > 20 ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="max-md:min-h-11"
            size="sm"
            variant="outline"
            isDisabled={offset === 0}
            onPress={() => setOffset((current) => Math.max(0, current - 20))}
          >
            Filas anteriores
          </Button>
          <Button
            type="button"
            className="max-md:min-h-11"
            size="sm"
            variant="outline"
            isDisabled={offset + 20 >= rows.length}
            onPress={() => setOffset((current) => current + 20)}
          >
            Filas siguientes
          </Button>
        </div>
      ) : null}
    </section>
  )
}

export function TeamImportReview({ rows }: { rows: TeamImportRow[] }) {
  const ready = rows.filter((row) => row.status === 'ready').length
  const duplicate = rows.filter((row) => row.status === 'duplicate').length
  return (
    <>
      <p className="text-muted-foreground text-sm">
        {ready} listas · {duplicate} duplicadas · {rows.length - ready - duplicate} con errores.
        Solo se enviarán las filas listas.
      </p>
      <PagedImportRows rows={rows} title="Vista previa">
        {(row) =>
          row.status === 'ready' ? (
            <>
              Lista: {row.invitation.email}
              {row.invitation.fullName ? ` · ${row.invitation.fullName}` : ''} ·{' '}
              {roleLabels[row.invitation.role]}
            </>
          ) : (
            <>
              {row.status === 'duplicate' ? 'Duplicada' : 'No válida'}: {row.message}
            </>
          )
        }
      </PagedImportRows>
    </>
  )
}

const outcomeLabels: Record<TeamImportOutcome['status'], string> = {
  invited: 'Invitación enviada por correo',
  added: 'Acceso confirmado para una cuenta existente',
  skipped: 'Omitida',
  unconfirmed: 'Resultado no confirmado',
  'not-attempted': 'Sin intentar',
}

export function summarizeTeamImport(outcomes: TeamImportOutcome[]): string {
  const count = (status: TeamImportOutcome['status']) =>
    outcomes.filter((row) => row.status === status).length
  return `Invitaciones enviadas: ${count('invited')}. Accesos confirmados: ${count('added')}. Omitidas: ${count('skipped')}. Sin confirmar: ${count('unconfirmed')}. Sin intentar: ${count('not-attempted')}.`
}

export function TeamImportResults({ outcomes }: { outcomes: TeamImportOutcome[] }) {
  return (
    <>
      <p className="text-sm">{summarizeTeamImport(outcomes)}</p>
      {outcomes.some((row) => row.status === 'unconfirmed') ? (
        <p role="alert" className="text-warning text-sm">
          Se detuvo el envío. Una fila sin confirmar pudo recibir correo. Comprueba el equipo antes
          de preparar otro archivo.
        </p>
      ) : null}
      <PagedImportRows rows={outcomes} title="Resultado por fila">
        {(row) => (
          <>
            {outcomeLabels[row.status]}
            {row.message ? `: ${row.message}` : ''}
          </>
        )}
      </PagedImportRows>
    </>
  )
}
