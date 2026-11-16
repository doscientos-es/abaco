import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { listMyDayTasks } from '../application/my-day-tasks'
import {
  listSignedDocuments,
  loadPaperSnapshots,
  openSignedDocument,
  uploadSignedDocument,
} from '../application/paper-visit-actions'
import type { VisitSummary } from '../application/visit-actions'

export function WorkerPaperReport({ tenantId, visit }: { tenantId: string; visit: VisitSummary }) {
  const cache = useQueryClient()
  const queryKey = ['worker-signed-documents', tenantId, visit.id]
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const fileId = useRef<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const documents = useQuery({
    queryKey,
    enabled: open,
    queryFn: () => listSignedDocuments(tenantId, visit.id),
  })

  async function prepareReport(action: 'download' | 'print') {
    if (busy) return
    setBusy(true)
    try {
      const [snapshots, work] = await Promise.all([
        loadPaperSnapshots(tenantId, [visit.id]),
        listMyDayTasks(tenantId, [visit]),
      ])
      const snapshot = snapshots[visit.id]
      if (!snapshot) throw new Error('No se pudo consultar el contenido de esta visita.')
      if (action === 'download') {
        const { downloadWorkerPaperReport } = await import('./worker-paper-report-pdf')
        await downloadWorkerPaperReport(visit, snapshot, work[0]?.tasks ?? [])
      } else {
        const { printWorkerPaperReport } = await import('./worker-paper-report-print')
        await printWorkerPaperReport(visit, snapshot, work[0]?.tasks ?? [])
      }
    } catch (error) {
      toast.error(
        action === 'download' ? 'No se pudo descargar el parte' : 'No se pudo imprimir el parte',
        {
          description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        },
      )
    } finally {
      setBusy(false)
    }
  }

  async function upload() {
    if (!file || !fileId.current || busy) return
    setBusy(true)
    try {
      await uploadSignedDocument(tenantId, visit.id, file, fileId.current)
      setFile(null)
      fileId.current = null
      if (input.current) input.current.value = ''
      await cache.invalidateQueries({ queryKey })
      toast.success('Parte firmado adjuntado')
    } catch (error) {
      toast.error('No se pudo adjuntar el parte firmado', {
        description: error instanceof Error ? error.message : 'Conserva el archivo y reintenta.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Parte para firma manual" className="space-y-2 rounded-lg border p-3">
      {visit.requires_acceptance === true ? (
        <p className="font-semibold">Esta visita requiere la conformidad del cliente.</p>
      ) : null}
      <p>
        Descarga o imprime el parte y pide al cliente que lo firme a mano. Puedes adjuntar una foto
        o PDF firmado para que lo consulte administración; el adjunto es opcional.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" isDisabled={busy} onPress={() => void prepareReport('download')}>
          Descargar parte PDF
        </Button>
        <Button variant="outline" isDisabled={busy} onPress={() => void prepareReport('print')}>
          Imprimir parte
        </Button>
        <Button variant="outline" onPress={() => setOpen(!open)}>
          {open ? 'Ocultar parte firmado' : 'Adjuntar parte firmado (opcional)'}
        </Button>
      </div>
      {open ? (
        <div className="space-y-2">
          {['scheduled', 'in_progress', 'completed'].includes(visit.status) ? (
            <>
              <label className="block">
                Foto o PDF del parte firmado (máximo 15 MB)
                <input
                  ref={input}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null)
                    fileId.current = crypto.randomUUID()
                  }}
                />
              </label>
              <Button isDisabled={!file || busy} onPress={() => void upload()}>
                Subir parte firmado
              </Button>
            </>
          ) : (
            <p>Esta visita no admite nuevos justificantes.</p>
          )}
          {documents.isPending ? <p>Cargando justificantes…</p> : null}
          {documents.isError ? <p role="alert">No se pudieron cargar los justificantes.</p> : null}
          {documents.data?.map((doc) => (
            <p key={doc.id}>
              <Button
                variant="ghost"
                onPress={() =>
                  void openSignedDocument(doc.object_path)
                    .then((url) => window.open(url, '_blank', 'noopener,noreferrer'))
                    .catch(() => toast.error('No se pudo abrir el justificante'))
                }
              >
                {doc.name}
              </Button>
            </p>
          ))}
        </div>
      ) : null}
    </section>
  )
}
