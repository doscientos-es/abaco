import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import {
  listVisitPhotos,
  photoExtension,
  uploadVisitPhoto,
  type VisitPhotoPhase,
} from '../application/visit-photo-actions'
import {
  listPendingVisitPhotos,
  removePendingVisitPhoto,
  savePendingVisitPhoto,
  visitPhotoQueueKey,
  type PendingVisitPhoto,
} from '../application/visit-photo-queue'

const phaseLabels: Record<VisitPhotoPhase, string> = {
  before: 'Antes',
  after: 'Después',
  other: 'Otra evidencia',
}

export function VisitPhotosPanel({
  tenantId,
  visitId,
  userId,
  closed,
}: {
  tenantId: string
  visitId: string
  userId: string
  closed: boolean
}) {
  const queryClient = useQueryClient()
  const queryKey = ['visit-photos', tenantId, visitId]
  const photos = useQuery({
    queryKey,
    queryFn: () => listVisitPhotos(tenantId, visitId),
    refetchInterval: 8 * 60_000,
  })
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<VisitPhotoPhase>('before')
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [pending, setPending] = useState<PendingVisitPhoto[]>([])
  const [queueError, setQueueError] = useState<string | null>(null)
  const [loadedScope, setLoadedScope] = useState<string | null>(null)
  const scope = `${userId}:${tenantId}:${visitId}`
  const queueReady = loadedScope === scope
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    void listPendingVisitPhotos(userId, tenantId, visitId)
      .then((items) => {
        if (active) {
          setPending(items)
          setQueueError(null)
        }
      })
      .catch((error: unknown) => {
        if (active)
          setQueueError(
            error instanceof Error ? error.message : 'No se pudo abrir la cola de fotos.',
          )
      })
      .finally(() => {
        if (active) setLoadedScope(scope)
      })
    return () => {
      active = false
    }
  }, [userId, tenantId, visitId, scope])

  async function send(item: PendingVisitPhoto) {
    if (uploading || closed) return
    setUploading(true)
    try {
      await uploadVisitPhoto({
        tenantId: item.tenantId,
        visitId: item.visitId,
        photoId: item.photoId,
        operationId: item.operationId,
        phase: item.phase,
        caption: item.caption,
        file: new File([item.blob], item.name, {
          type: item.mimeType,
          lastModified: item.lastModified,
        }),
      })
      await removePendingVisitPhoto(item.key)
      setPending((items) => items.filter((photo) => photo.key !== item.key))
      await queryClient.invalidateQueries({ queryKey })
      toast.success('Fotografía guardada en el parte')
    } catch (error) {
      toast.error('No se pudo guardar la fotografía', {
        description: error instanceof Error ? error.message : 'Conserva el archivo y reintenta.',
      })
    } finally {
      setUploading(false)
    }
  }

  async function upload() {
    if (
      !file ||
      uploading ||
      closed ||
      !queueReady ||
      queueError ||
      photos.isPending ||
      photos.isError
    )
      return
    try {
      photoExtension(file)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Imagen no válida')
      return
    }
    if ((photos.data?.length ?? 0) + pending.length >= 20) {
      toast.error('La visita ya tiene 20 fotografías')
      return
    }
    const photoId = crypto.randomUUID()
    const item: PendingVisitPhoto = {
      key: visitPhotoQueueKey(userId, tenantId, visitId, photoId),
      userId,
      tenantId,
      visitId,
      photoId,
      operationId: crypto.randomUUID(),
      phase,
      caption: caption.trim(),
      name: file.name,
      mimeType: file.type,
      lastModified: file.lastModified,
      blob: file,
    }
    setUploading(true)
    try {
      await savePendingVisitPhoto(item)
      setPending((items) => [...items, item])
      setFile(null)
      setCaption('')
      if (fileInput.current) fileInput.current.value = ''
      toast.success('Fotografía guardada en este dispositivo')
    } catch (error) {
      toast.error('No se pudo conservar la fotografía', {
        description: error instanceof Error ? error.message : 'Conserva el archivo original.',
      })
    } finally {
      setUploading(false)
    }
  }

  async function discard(item: PendingVisitPhoto) {
    if (uploading) return
    setUploading(true)
    try {
      await removePendingVisitPhoto(item.key)
      setPending((items) => items.filter((photo) => photo.key !== item.key))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo descartar la fotografía.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <section
      className="border-border space-y-3 border-t pt-4"
      aria-label="Fotografías de la visita"
    >
      <h3 className="font-medium">Fotografías antes y después</h3>
      {queueError ? (
        <p role="alert" className="text-destructive text-sm">
          {queueError}
        </p>
      ) : null}
      {pending.length ? (
        <div className="space-y-2">
          <p className="text-warning text-sm">
            {pending.length} fotografía(s) pendiente(s) en este dispositivo. Envíalas o descártalas
            antes de completar la visita.
          </p>
          <ul className="space-y-2">
            {pending.map((item) => (
              <li
                key={item.key}
                className="border-border flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {phaseLabels[item.phase]} · {item.name}
                </span>
                {!closed ? (
                  <Button size="sm" isDisabled={uploading} onPress={() => void send(item)}>
                    Enviar
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  isDisabled={uploading}
                  onPress={() => void discard(item)}
                >
                  Descartar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {photos.isPending ? (
        <p className="text-muted-foreground text-sm">Cargando fotografías…</p>
      ) : null}
      {photos.isError ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudieron cargar las fotografías. Reintenta antes de añadir otra.
        </p>
      ) : null}
      {photos.data?.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photos.data.map((photo) => (
            <li key={photo.id} className="border-border overflow-hidden rounded-lg border">
              <a href={photo.url} target="_blank" rel="noopener noreferrer">
                <img
                  src={photo.url}
                  alt={photo.caption || `Fotografía ${phaseLabels[photo.phase].toLowerCase()}`}
                  className="aspect-video w-full object-cover"
                  loading="lazy"
                />
              </a>
              <div className="p-2 text-sm">
                <p className="font-medium">{phaseLabels[photo.phase]}</p>
                {photo.caption ? <p>{photo.caption}</p> : null}
                <time className="text-muted-foreground text-xs" dateTime={photo.created_at}>
                  {new Date(photo.created_at).toLocaleString('es-ES')}
                </time>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {!closed ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Imagen
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              disabled={uploading}
              className="border-input bg-background mt-1 block w-full rounded-lg border p-2"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <label className="text-sm">
            Momento
            <select
              value={phase}
              disabled={uploading}
              className="border-input bg-background mt-1 block w-full rounded-lg border p-2"
              onChange={(event) => setPhase(event.target.value as VisitPhotoPhase)}
            >
              {Object.entries(phaseLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            Descripción de la imagen
            <input
              value={caption}
              maxLength={300}
              disabled={uploading}
              className="border-input bg-background mt-1 block w-full rounded-lg border p-2"
              onChange={(event) => setCaption(event.target.value)}
            />
          </label>
          <div className="sm:col-span-2">
            <Button
              size="sm"
              isDisabled={
                !file ||
                uploading ||
                !queueReady ||
                Boolean(queueError) ||
                photos.isPending ||
                photos.isError
              }
              onPress={() => void upload()}
            >
              {uploading ? 'Guardando fotografía…' : 'Preparar fotografía'}
            </Button>
            <p className="text-muted-foreground mt-1 text-xs">
              JPEG, PNG o WebP · hasta 10 MB · máximo 20 fotografías por visita.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  )
}
