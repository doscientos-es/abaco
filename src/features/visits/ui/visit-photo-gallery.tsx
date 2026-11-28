import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { useActionLock } from '@/shared/lib/use-action-lock'

import type { VisitPhoto } from '../application/visit-photo-actions'
import { listVisitPhotoPairs, setVisitPhotoPair } from '../application/visit-photo-pair-actions'
import {
  layoutVisitPhotos,
  visitPhotoPhaseLabels,
  visitPhotoPhases,
  type PhotoChronology,
} from '../domain/visit-photo-layout'

const photoDate = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' })

export function VisitPhotoGallery({
  photos,
  tenantId,
  visitId,
  userId,
  closed,
}: {
  photos: readonly VisitPhoto[]
  tenantId: string
  visitId: string
  userId: string
  closed: boolean
}) {
  const queryClient = useQueryClient()
  const queryKey = ['visit-photo-pairs', tenantId, visitId, userId]
  const lock = useActionLock()
  const heading = useRef<HTMLHeadingElement>(null)
  const focusAfterMutation = useRef<string | null | undefined>(undefined)
  const [sort, setSort] = useState<PhotoChronology>('newest')
  const [beforeId, setBeforeId] = useState('')
  const [afterId, setAfterId] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const canHavePairs =
    photos.some(({ phase }) => phase === 'before') && photos.some(({ phase }) => phase === 'after')
  const pairs = useQuery({
    queryKey,
    enabled: canHavePairs,
    queryFn: () => listVisitPhotoPairs(tenantId, visitId),
  })
  const { matched, unpaired } = layoutVisitPhotos(photos, pairs.data ?? [], sort)
  const canPair =
    !closed && pairs.isSuccess && unpaired.before.length > 0 && unpaired.after.length > 0
  const selectedBefore = unpaired.before.some(({ id }) => id === beforeId) ? beforeId : ''
  const selectedAfter = unpaired.after.some(({ id }) => id === afterId) ? afterId : ''

  useEffect(() => {
    if (busy || focusAfterMutation.current === undefined) return
    const before = focusAfterMutation.current
    focusAfterMutation.current = undefined
    const target = before ? document.getElementById(`before-after-photo-pair-${before}`) : null
    const focusTarget = target ?? heading.current
    focusTarget?.focus()
  }, [busy, pairs.data])

  async function changePair(before: string, after: string, paired: boolean) {
    if (closed || busy || !before || !after || !lock.acquire()) return
    setFailure('')
    setBusy(true)
    try {
      await setVisitPhotoPair(tenantId, visitId, before, after, paired)
      setBeforeId('')
      setAfterId('')
      focusAfterMutation.current = paired ? before : null
      await queryClient.invalidateQueries({ queryKey })
      toast.success(paired ? 'Pareja guardada' : 'Fotos separadas. Ninguna se ha eliminado.')
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'No se pudo actualizar la pareja.')
      await queryClient.invalidateQueries({ queryKey })
    } finally {
      setBusy(false)
      lock.release()
    }
  }

  return (
    <section className="min-w-0 space-y-4" aria-label="Galería de fotografías">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h4
          ref={heading}
          tabIndex={-1}
          className="focus-visible:outline-ring font-semibold outline-offset-2"
        >
          Galería · {photos.length} {photos.length === 1 ? 'foto' : 'fotos'}
        </h4>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium">
          Orden de la galería
          <select
            className="border-input bg-background min-h-11 min-w-0 rounded-md border px-2 text-sm"
            value={sort}
            onChange={(event) => setSort(event.target.value === 'oldest' ? 'oldest' : 'newest')}
          >
            <option value="newest">Más recientes primero</option>
            <option value="oldest">Más antiguas primero</option>
          </select>
        </label>
      </div>
      {canHavePairs && pairs.isError ? (
        <div className="border-border flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
          <p role="alert">No se pudieron cargar las parejas. Las fotografías siguen disponibles.</p>
          <Button
            size="sm"
            variant="outline"
            className="min-h-11"
            onPress={() => void pairs.refetch()}
          >
            Reintentar parejas
          </Button>
        </div>
      ) : null}
      {canHavePairs && pairs.isPending ? (
        <output className="text-muted-foreground text-sm">Cargando parejas…</output>
      ) : null}
      {failure ? (
        <p role="alert" className="text-destructive text-sm">
          {failure}
        </p>
      ) : null}
      {canPair ? (
        <div className="border-border bg-muted/35 min-w-0 space-y-2 rounded-lg border p-3">
          <h5 className="font-semibold">Crear pareja antes y después</h5>
          <p className="text-muted-foreground text-xs">
            Compara dos fotos del mismo punto. Deben estar enviadas.
          </p>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            <PhotoSelect
              label="Foto de antes"
              photos={unpaired.before}
              value={selectedBefore}
              disabled={busy}
              onChange={setBeforeId}
            />
            <PhotoSelect
              label="Foto de después"
              photos={unpaired.after}
              value={selectedAfter}
              disabled={busy}
              onChange={setAfterId}
            />
          </div>
          <Button
            className="min-h-11"
            size="sm"
            isDisabled={busy || !selectedBefore || !selectedAfter}
            onPress={() => void changePair(selectedBefore, selectedAfter, true)}
          >
            Guardar pareja
          </Button>
        </div>
      ) : null}
      {matched.length ? (
        <section aria-label="Parejas antes y después" className="space-y-2">
          <h5 className="font-semibold">Parejas antes y después</h5>
          <ol className="space-y-3">
            {matched.map(({ before, after }, index) => (
              <li
                key={before.id}
                id={`before-after-photo-pair-${before.id}`}
                tabIndex={-1}
                className="border-border focus-visible:outline-ring min-w-0 space-y-2 rounded-lg border p-2 outline-offset-2"
              >
                <div className="grid min-w-0 grid-cols-2 gap-2">
                  <PhotoTile photo={before} />
                  <PhotoTile photo={after} />
                </div>
                {!closed ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    aria-label={`Separar pareja ${index + 1} sin eliminar las fotos`}
                    isDisabled={busy}
                    onPress={() => void changePair(before.id, after.id, false)}
                  >
                    Separar pareja
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {visitPhotoPhases.map((phase) =>
        unpaired[phase].length ? (
          <section key={phase} aria-label={visitPhotoPhaseLabels[phase]} className="space-y-2">
            <h5 className="font-semibold">
              {visitPhotoPhaseLabels[phase]} · {unpaired[phase].length}
            </h5>
            <ul className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-3">
              {unpaired[phase].map((photo) => (
                <li key={photo.id} className="min-w-0">
                  <PhotoTile photo={photo} />
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </section>
  )
}

function PhotoSelect({
  label,
  photos,
  value,
  disabled,
  onChange,
}: {
  label: string
  photos: readonly VisitPhoto[]
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
      {label}
      <select
        className="border-input bg-background min-h-11 w-full min-w-0 rounded-md border px-2"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Elige una foto</option>
        {photos.map((photo, i) => (
          <option key={photo.id} value={photo.id}>
            {i + 1}. {photo.caption || photoDate.format(new Date(photo.created_at))}
          </option>
        ))}
      </select>
    </label>
  )
}

function PhotoTile({ photo }: { photo: VisitPhoto }) {
  const phase = visitPhotoPhaseLabels[photo.phase]
  return (
    <figure className="border-border bg-card min-w-0 overflow-hidden rounded-md border">
      <a
        href={photo.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Abrir foto: ${phase}${photo.caption ? `, ${photo.caption}` : ''}`}
      >
        <img
          src={photo.url}
          alt={photo.caption || `Fotografía: ${phase}`}
          className="aspect-[4/3] w-full object-cover"
          loading="lazy"
        />
      </a>
      <figcaption className="min-w-0 p-2 text-xs wrap-break-word">
        <p className="font-semibold">{phase}</p>
        {photo.caption ? <p>{photo.caption}</p> : null}
        <time className="text-muted-foreground" dateTime={photo.created_at}>
          {photoDate.format(new Date(photo.created_at))}
        </time>
      </figcaption>
    </figure>
  )
}
