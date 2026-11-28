import { Button } from '@doscientos/ui'
import { ArrowBendUpRightIcon } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState, type FormEvent } from 'react'

import { useActionLock } from '@/shared/lib/use-action-lock'

import type { VisitSummary } from '../application/visit-actions'
import {
  addVisitHandoff,
  resolveVisitHandoff,
  visitHandoffsKey,
  visitHandoffsQuery,
  type VisitHandoff,
} from '../application/visit-handoff-actions'

const labels: Record<VisitHandoff['status'], string> = {
  pending: 'Pendiente',
  resolved: 'Resuelto',
  not_forwarded: 'No enviado',
}

export function VisitHandoffsPanel({
  tenantId,
  visit,
  userId,
}: {
  tenantId: string
  visit: VisitSummary
  userId: string
}) {
  const queryClient = useQueryClient()
  const query = useQuery(visitHandoffsQuery(tenantId, visit.id, userId, visit.updated_at))
  const data = query.isFetchedAfterMount && !query.isError ? query.data : undefined
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null)
  const operations = useRef(new Map<string, string>())
  const lock = useActionLock()
  const headingId = useId()
  const fieldId = useId()
  const open = ['scheduled', 'in_progress'].includes(visit.status)

  async function run(key: string, action: (operationId: string) => Promise<void>, success: string) {
    if (!lock.acquire()) return
    const operationId = operations.current.get(key) ?? crypto.randomUUID()
    operations.current.set(key, operationId)
    setBusy(key)
    setFeedback(null)
    try {
      await action(operationId)
      operations.current.delete(key)
      setFeedback({ message: success, error: false })
      await queryClient.invalidateQueries({ queryKey: visitHandoffsKey(tenantId) })
    } catch {
      // A timeout can follow a successful commit. Keep the same ID and confirm
      // the fresh server state rather than treating either result as certain.
      setFeedback({
        message: 'No se pudo confirmar el cambio. Comprueba el estado o reintenta.',
        error: true,
      })
      await query.refetch()
    } finally {
      lock.release()
      setBusy(null)
    }
  }

  function create(event: FormEvent) {
    event.preventDefault()
    const clean = title.replace(/\s+/g, ' ').trim()
    if (!clean || !data?.can_create || !open) return
    if (
      data.incoming.some(
        (item) =>
          item.status === 'pending' &&
          item.title.toLocaleLowerCase('es') === clean.toLocaleLowerCase('es'),
      )
    ) {
      setFeedback({
        message:
          'Ese pendiente ya está aquí. Déjalo sin resolver para que pase a la próxima visita.',
        error: true,
      })
      return
    }
    void run(
      'add',
      async (operationId) => {
        await addVisitHandoff(tenantId, visit.id, clean, operationId)
        setTitle('')
      },
      'Pendiente guardado.',
    )
  }

  function resolve(item: VisitHandoff) {
    if (!data?.can_resolve || visit.status !== 'in_progress' || item.status !== 'pending') return
    void run(
      item.id,
      (operationId) => resolveVisitHandoff(tenantId, visit.id, item.id, operationId),
      'Pendiente marcado como resuelto.',
    )
  }

  if (!open && data && !data.incoming.length && !data.outgoing.length) return null

  return (
    <section
      aria-labelledby={headingId}
      className="border-border bg-muted/30 grid min-w-0 gap-3 rounded-lg border p-3"
    >
      <h3 id={headingId} className="flex items-center gap-2 text-sm font-semibold">
        <ArrowBendUpRightIcon size={17} aria-hidden="true" /> Pendientes entre visitas
      </h3>
      {query.isError ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <p role="alert">No se pudieron consultar los pendientes de esta visita.</p>
          <Button variant="outline" className="min-h-11" onPress={() => void query.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : !data ? (
        <output className="text-muted-foreground text-sm">Consultando pendientes…</output>
      ) : (
        <>
          {data.incoming.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Para esta visita</h4>
              <ul className="divide-border divide-y">
                {data.incoming.map((item) => (
                  <li
                    key={item.id}
                    className="grid gap-1 py-2 sm:flex sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm wrap-break-word">{item.title}</p>
                      <p className="text-muted-foreground text-xs">{labels[item.status]}</p>
                    </div>
                    {item.status === 'pending' &&
                    data.can_resolve &&
                    visit.status === 'in_progress' ? (
                      <Button
                        variant="outline"
                        className="min-h-11 justify-self-start"
                        isDisabled={busy !== null}
                        aria-label={`Marcar como resuelto: ${item.title}`}
                        onPress={() => resolve(item)}
                      >
                        {busy === item.id ? 'Guardando…' : 'Marcar resuelto'}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {data.incoming_has_more ? (
                <p className="text-muted-foreground text-xs">
                  Se muestran hasta 50 resultados, con los pendientes primero.
                </p>
              ) : null}
              {!data.can_resolve && visit.status === 'scheduled' ? (
                <p className="text-muted-foreground text-xs">
                  Inicia la visita para poder marcar estos pendientes como resueltos.
                </p>
              ) : null}
            </div>
          ) : null}
          {data.outgoing.length > 0 ? (
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Guardados desde este parte</h4>
              <ul className="divide-border divide-y">
                {data.outgoing.map((item) => (
                  <li key={item.id} className="grid min-w-0 gap-1 py-2 text-sm">
                    <span className="wrap-break-word">{item.title}</span>
                    <span className="text-muted-foreground text-xs">{labels[item.status]}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {open && data.can_create ? (
            <form onSubmit={create} className="grid gap-2">
              <label htmlFor={fieldId} className="text-sm font-medium">
                Dejar un pendiente para la próxima visita
              </label>
              <p id={`${fieldId}-scope`} className="text-muted-foreground text-xs">
                Al completar la visita, se mostrará a quien tenga asignada la siguiente del mismo
                ámbito. No se copiarán tus notas.
              </p>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  className="border-input bg-background min-h-11 w-full min-w-0 rounded-lg border px-3 text-sm"
                  id={fieldId}
                  aria-describedby={`${fieldId}-scope`}
                  value={title}
                  maxLength={160}
                  disabled={busy !== null}
                  placeholder="Ej. Revisar la presión de la bomba"
                  onChange={(event) => {
                    setTitle(event.target.value)
                    operations.current.delete('add')
                  }}
                />
                <Button
                  type="submit"
                  className="min-h-11"
                  isDisabled={!title.trim() || busy !== null}
                >
                  {busy === 'add' ? 'Guardando…' : 'Guardar pendiente'}
                </Button>
              </div>
            </form>
          ) : open && !data.has_scope ? (
            <p className="text-muted-foreground text-sm">
              La visita necesita un centro, contrato o trabajo para dejar un pendiente.
            </p>
          ) : open && data.outgoing.length >= 25 ? (
            <p className="text-muted-foreground text-sm">
              Este parte ya tiene 25 pendientes guardados.
            </p>
          ) : null}
        </>
      )}
      {feedback?.error ? (
        <p className="text-destructive text-sm" role="alert">
          {feedback.message}
        </p>
      ) : feedback ? (
        <output className="text-sm">{feedback.message}</output>
      ) : null}
    </section>
  )
}
