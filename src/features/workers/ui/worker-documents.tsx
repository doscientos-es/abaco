import { Button } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import {
  downloadWorkerDocument,
  listWorkerDocuments,
  uploadWorkerDocument,
  type WorkerDocument,
} from '../application/worker-document-actions'

export function WorkerDocuments({ tenantId, workerId }: { tenantId: string; workerId: string }) {
  const queryKey = ['worker-documents', tenantId, workerId]
  const queryClient = useQueryClient()
  const documents = useQuery({ queryKey, queryFn: () => listWorkerDocuments(tenantId, workerId) })
  const [selection, setSelection] = useState<{ file: File; id: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  async function upload() {
    if (!selection || busy) return
    setBusy(true)
    setError(null)
    try {
      await uploadWorkerDocument({ tenantId, workerId, ...selection })
      setSelection(null)
      if (fileInput.current) fileInput.current.value = ''
      await queryClient.invalidateQueries({ queryKey })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el documento.')
    } finally {
      setBusy(false)
    }
  }

  async function download(document: WorkerDocument) {
    setError(null)
    try {
      const blob = await downloadWorkerDocument(document.object_path)
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = document.name
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo descargar el documento.')
    }
  }

  return (
    <section
      aria-labelledby="worker-documents-heading"
      className="border-border space-y-4 rounded-lg border p-4"
    >
      <div>
        <h2 id="worker-documents-heading" className="font-semibold">
          Documentos
        </h2>
        <p className="text-muted-foreground text-sm">
          Privados: solo los administradores de la empresa pueden acceder.
        </p>
      </div>
      {documents.isPending ? <p>Cargando documentos…</p> : null}
      {documents.isError ? (
        <div role="alert">
          <p>No se pudieron cargar los documentos.</p>
          <Button variant="outline" onPress={() => void documents.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {documents.isSuccess && documents.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">Todavía no hay documentos.</p>
      ) : null}
      {documents.data?.length ? (
        <ul className="space-y-2">
          {documents.data.map((document) => (
            <li key={document.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 text-sm break-all">{document.name}</span>
              <Button
                variant="outline"
                size="sm"
                onPress={() => void download(document)}
                aria-label={`Descargar ${document.name}`}
              >
                Descargar
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <label className="block text-sm">
        Añadir documento (PDF o imagen, máximo 15 MB)
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          disabled={busy}
          className="border-input bg-background mt-1 block w-full rounded-lg border p-2"
          onChange={(event) => {
            const file = event.target.files?.[0]
            setSelection(file ? { file, id: crypto.randomUUID() } : null)
            setError(null)
          }}
        />
      </label>
      <Button isDisabled={!selection || busy} onPress={() => void upload()}>
        {busy ? 'Guardando…' : 'Guardar documento'}
      </Button>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </section>
  )
}
