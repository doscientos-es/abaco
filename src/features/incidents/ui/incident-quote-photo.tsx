import { Button } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { useSession } from '@/features/auth'

import {
  openIncidentQuotePhoto,
  type IncidentQuotePhoto,
} from '../application/incident-quote-actions'

const phases = { before: 'Antes', after: 'Después', other: 'Evidencia' }

export function IncidentQuotePhotoPreview({
  tenantId,
  visitId,
  photo,
  number,
  authorization,
}: {
  tenantId: string
  visitId: string
  photo: IncidentQuotePhoto
  number: number
  authorization?: { selected: boolean; disabled: boolean; onChange: (selected: boolean) => void }
}) {
  const userId = useSession()?.userId
  const [open, setOpen] = useState(false)
  const [viewed, setViewed] = useState(false)
  const [failed, setFailed] = useState(false)
  const file = useQuery({
    queryKey: ['incident-quote-photo', tenantId, userId, visitId, photo.id],
    queryFn: () => openIncidentQuotePhoto(tenantId, visitId, photo.id),
    enabled: open,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })
  const label = `Foto ${number} · ${phases[photo.phase]}`
  return (
    <li className="border-border min-w-0 space-y-2 rounded-md border p-3">
      <p className="font-medium">{label}</p>
      {photo.caption ? (
        <p className="text-muted-foreground wrap-anywhere">{photo.caption}</p>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        className="min-h-11"
        aria-expanded={open}
        onPress={() => setOpen((previous) => !previous)}
      >
        {open ? `Cerrar foto ${number}` : `Ver foto privada ${number}`}
      </Button>
      {open && file.isPending ? <output>Cargando foto…</output> : null}
      {open && (file.isError || failed) ? (
        <div className="space-y-2">
          <p role="alert">No se pudo abrir la foto privada.</p>
          <Button
            size="sm"
            variant="outline"
            onPress={() => {
              setFailed(false)
              void file.refetch()
            }}
          >
            Reintentar foto {number}
          </Button>
        </div>
      ) : null}
      {open && file.data && !failed ? (
        <img
          src={file.data}
          alt={`Evidencia operativa: ${label}`}
          referrerPolicy="no-referrer"
          className="max-h-56 w-full rounded object-contain"
          onLoad={() => setViewed(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
      {authorization ? (
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className="accent-primary size-5 shrink-0"
            checked={authorization.selected}
            disabled={!viewed || authorization.disabled}
            onChange={(event) => authorization.onChange(event.target.checked)}
          />
          Referenciar foto {number} solo internamente
        </label>
      ) : null}
    </li>
  )
}
