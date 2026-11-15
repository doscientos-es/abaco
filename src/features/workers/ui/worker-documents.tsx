import { Button } from '@doscientos/ui'
import {
  DownloadSimple,
  File as FileIcon,
  FilePdf,
  FileImage,
  UploadSimple,
} from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type DragEvent } from 'react'

import {
  downloadWorkerDocument,
  listWorkerDocuments,
  uploadWorkerDocument,
  type WorkerDocument,
} from '../application/worker-document-actions'
import {
  validateWorkerDocumentFile,
  workerDocumentAccept,
  workerDocumentType,
  type WorkerDocumentType,
} from '../domain/worker-document-file'

const typeLabels: Record<WorkerDocumentType, string> = {
  pdf: 'PDF',
  image: 'Imagen',
  other: 'Otro archivo',
}

function DocumentAvatar({ type }: { type: WorkerDocumentType }) {
  const Icon = type === 'pdf' ? FilePdf : type === 'image' ? FileImage : FileIcon
  const colors =
    type === 'pdf'
      ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
      : type === 'image'
        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
        : 'bg-muted text-muted-foreground'
  return (
    <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${colors}`}>
      <Icon aria-hidden="true" className="size-6" />
    </span>
  )
}

export function WorkerDocuments({ tenantId, workerId }: { tenantId: string; workerId: string }) {
  const queryKey = ['worker-documents', tenantId, workerId]
  const queryClient = useQueryClient()
  const documents = useQuery({ queryKey, queryFn: () => listWorkerDocuments(tenantId, workerId) })
  const [selection, setSelection] = useState<{ file: File; id: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | WorkerDocumentType>('all')
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  function selectFiles(files: FileList | File[]) {
    if (busy || files.length === 0) return
    if (fileInput.current) fileInput.current.value = ''
    if (files.length !== 1) {
      setSelection(null)
      setError('Selecciona un documento cada vez.')
      return
    }
    const file = files[0]
    if (!file) return
    const validationError = validateWorkerDocumentFile(file)
    if (validationError) {
      setSelection(null)
      setError(validationError)
      return
    }
    setSelection({ file, id: crypto.randomUUID() })
    setError(null)
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    selectFiles(event.dataTransfer.files)
  }

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

  const filtered = (documents.data ?? []).filter(
    (document) => filter === 'all' || workerDocumentType(document.name) === filter,
  )

  return (
    <section aria-labelledby="worker-documents-heading" className="space-y-6">
      <div className="space-y-1">
        <h2 id="worker-documents-heading" className="text-lg font-semibold">
          Documentos
        </h2>
        <p className="text-muted-foreground text-sm">
          Privados: solo los administradores de la empresa pueden acceder.
        </p>
      </div>
      <div
        data-testid="document-dropzone"
        onDragOver={(event) => {
          event.preventDefault()
          if (!busy) setDragging(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={drop}
        className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          dragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'
        }`}
      >
        <UploadSimple aria-hidden="true" className="text-primary mx-auto mb-3 size-7" />
        <p className="font-medium">Arrastra un documento aquí</p>
        <p className="text-muted-foreground mt-1 text-sm">PDF, JPEG, PNG o WebP · máximo 15 MB</p>
        <label className="border-input bg-background hover:bg-muted focus-within:ring-ring mt-4 inline-flex cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium focus-within:ring-2">
          Seleccionar archivo
          <input
            ref={fileInput}
            type="file"
            accept={workerDocumentAccept}
            disabled={busy}
            className="sr-only"
            onChange={(event) => selectFiles(Array.from(event.target.files ?? []))}
          />
        </label>
      </div>
      {selection ? (
        <div className="border-border bg-card flex flex-wrap items-center gap-3 rounded-xl border p-4">
          <DocumentAvatar type={workerDocumentType(selection.file.name)} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={selection.file.name}>
              {selection.file.name}
            </p>
            <p className="text-muted-foreground text-xs">Listo para guardar</p>
          </div>
          <Button
            variant="outline"
            isDisabled={busy}
            onPress={() => {
              setSelection(null)
              setError(null)
            }}
          >
            Quitar
          </Button>
          <Button isDisabled={busy} onPress={() => void upload()}>
            {busy ? 'Guardando…' : 'Guardar documento'}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold">Archivos guardados</h3>
          {documents.isSuccess ? (
            <p className="text-muted-foreground text-sm">
              {documents.data.length} {documents.data.length === 1 ? 'documento' : 'documentos'}
            </p>
          ) : null}
        </div>
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          Tipo
          <select
            aria-label="Filtrar por tipo de archivo"
            value={filter}
            onChange={(event) => setFilter(event.target.value as 'all' | WorkerDocumentType)}
            className="border-input bg-background text-foreground rounded-lg border px-3 py-2"
          >
            <option value="all">Todos</option>
            <option value="pdf">PDF</option>
            <option value="image">Imágenes</option>
            <option value="other">Otros</option>
          </select>
        </label>
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
      {documents.isSuccess && documents.data.length > 0 && filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">No hay archivos de este tipo.</p>
      ) : null}
      {filtered.length ? (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((document) => (
            <li
              key={document.id}
              className="border-border bg-card flex min-w-0 items-center gap-3 rounded-xl border p-4"
            >
              <DocumentAvatar type={workerDocumentType(document.name)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={document.name}>
                  {document.name}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {typeLabels[workerDocumentType(document.name)]} ·{' '}
                  {new Date(document.created_at).toLocaleDateString('es-ES')}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => void download(document)}
                aria-label={`Descargar ${document.name}`}
              >
                <DownloadSimple aria-hidden="true" className="size-5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
