import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { workTeamsQuery } from '@/features/work-teams/application/work-team-actions'
import { printDocument } from '@/shared/lib/print-document'
import { SelectField, TextareaField, TextField } from '@/shared/ui/form'

import {
  loadPaperVisit,
  openSignedDocument,
  updatePaperVisit,
  uploadSignedDocument,
} from '../application/paper-visit-actions'
import type { VisitSummary } from '../application/visit-actions'
import { PaperWorkSheet } from './paper-work-sheet'

export function PaperVisitPanel({ tenantId, visit }: { tenantId: string; visit: VisitSummary }) {
  const cache = useQueryClient()
  const queryKey = ['paper-visit', tenantId, visit.id]
  const query = useQuery({ queryKey, queryFn: () => loadPaperVisit(tenantId, visit.id) })
  const teams = useQuery(workTeamsQuery(tenantId))
  const [team, setTeam] = useState(visit.work_team_id ?? '')
  const [order, setOrder] = useState(String(visit.route_order ?? 0))
  const [date, setDate] = useState(() =>
    new Intl.DateTimeFormat('sv-SE', { timeZone: visit.timezone }).format(new Date()),
  )
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const operations = useRef(new Map<string, string>())
  const fileId = useRef(crypto.randomUUID())
  async function run(action: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    try {
      await action()
      await Promise.all([
        cache.invalidateQueries({ queryKey }),
        cache.invalidateQueries({ queryKey: ['office-visits', tenantId] }),
        cache.invalidateQueries({ queryKey: ['client-cleaning-history', tenantId] }),
      ])
      toast.success('Guardado')
    } catch (error) {
      toast.error('No se pudo completar', {
        description: error instanceof Error ? error.message : 'Reintenta.',
      })
    } finally {
      setBusy(false)
    }
  }
  function save(change: Record<string, unknown>) {
    if (!query.data) return
    const key = JSON.stringify([query.data.visit.updated_at, change])
    const operation = operations.current.get(key) ?? crypto.randomUUID()
    operations.current.set(key, operation)
    const current = query.data.visit
    void run(() => updatePaperVisit(tenantId, current, change, operation))
  }
  if (query.isPending) return <output>Cargando parte e historial…</output>
  if (query.isError || !query.data)
    return (
      <p role="alert">
        No se pudo cargar el parte. <Button onPress={() => void query.refetch()}>Reintentar</Button>
      </p>
    )
  const current = query.data.visit
  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap gap-3">
        <Link
          to="/clientes/$clientId"
          params={{ clientId: current.client_id }}
          className="text-primary underline"
        >
          Ver cliente y centros
        </Link>
        {current.contract_id ? (
          <Link
            to="/contratos/$contractId"
            params={{ contractId: current.contract_id }}
            className="text-primary underline"
          >
            Ver contrato y servicio
          </Link>
        ) : null}
      </div>
      <div ref={sheet}>
        <PaperWorkSheet visit={visit} snapshot={current.paper_snapshot} />
      </div>
      <Button
        variant="outline"
        onPress={() => {
          if (sheet.current)
            void printDocument(sheet.current, 'Parte de trabajo').catch(() =>
              toast.error('No se pudo imprimir'),
            )
        }}
      >
        Imprimir este parte
      </Button>
      <p>
        Estado:{' '}
        {current.status === 'completed'
          ? `Realizada · ${current.performed_on ?? 'Consultar cierre'}`
          : current.status === 'canceled'
            ? 'Cancelada · no prestada'
            : 'Pendiente'}{' '}
        · {query.data.documents.length ? 'Conformidad adjunta' : 'Sin conformidad adjunta'}
      </p>
      {current.completion_notes ? (
        <p className="whitespace-pre-wrap">{current.completion_notes}</p>
      ) : null}
      {['scheduled', 'in_progress'].includes(current.status) ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Equipo de esta visita"
            value={team}
            onChange={setTeam}
            options={[
              { value: '', label: 'Sin equipo' },
              ...(teams.data ?? [])
                .filter((t) => !t.archived || t.id === team)
                .map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
          <p className="text-muted-foreground text-sm">
            Al asignar un equipo se sustituye la asignación individual. Sus integrantes actuales
            podrán trabajar en la visita y cerrarla.
          </p>
          <TextField
            label="Orden de salida"
            type="number"
            min={0}
            max={10000}
            value={order}
            onChange={setOrder}
            placeholder="0"
          />
          <Button
            isDisabled={busy}
            variant="outline"
            onPress={() =>
              save({ action: 'assign', work_team_id: team || null, route_order: Number(order) })
            }
          >
            Guardar equipo y orden
          </Button>
          <TextField
            label="Fecha real de realización"
            type="date"
            value={date}
            onChange={setDate}
            placeholder="Fecha real"
          />
          <TextareaField
            label="Trabajo realizado e incidencias"
            value={notes}
            onChange={setNotes}
            maxLength={5000}
            placeholder="Registro de administración, sin fichaje"
          />
          <Button
            isDisabled={busy || !date}
            onPress={() =>
              save({ action: 'complete', performed_on: date, completion_notes: notes })
            }
          >
            Registrar realizada
          </Button>
          <TextField
            label="Motivo de cancelación"
            value={reason}
            onChange={setReason}
            maxLength={500}
            placeholder="Motivo obligatorio para cancelar"
          />
          <Button
            variant="outline"
            isDisabled={busy || !reason.trim()}
            onPress={() => save({ action: 'cancel', reason })}
          >
            Cancelar visita
          </Button>
        </div>
      ) : null}
      <section className="space-y-2">
        <h3 className="font-semibold">Justificantes privados</h3>
        <input
          aria-label="Parte firmado (PDF o foto)"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            fileId.current = crypto.randomUUID()
          }}
        />
        <Button
          variant="outline"
          isDisabled={busy || !file}
          onPress={() => {
            if (file) void run(() => uploadSignedDocument(tenantId, visit.id, file, fileId.current))
          }}
        >
          Adjuntar justificante
        </Button>
        {query.data.documents.map((doc) => (
          <p key={doc.id}>
            <Button
              variant="ghost"
              onPress={() =>
                void openSignedDocument(doc.object_path)
                  .then((url) => {
                    window.open(url, '_blank', 'noopener,noreferrer')
                  })
                  .catch(() => toast.error('No se pudo abrir el justificante'))
              }
            >
              {doc.name}
            </Button>
          </p>
        ))}
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">Historial de esta ocurrencia</h3>
        <p>
          Referencia original: {current.contract_occurrence_on ?? 'Visita puntual'}. Reprogramar no
          cambia la pauta futura.
        </p>
        <ol className="space-y-3">
          {query.data.events.map((event) => (
            <li key={event.id} className="rounded border p-2 text-sm">
              <p>
                {new Date(event.occurred_at).toLocaleString('es-ES')} · Usuario:{' '}
                {event.actor_id ?? 'Generación del sistema'}
              </p>
              <p className="break-words whitespace-pre-wrap">
                {JSON.stringify(event.payload, null, 2)}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </section>
  )
}
