import { Button, Card, CardContent, CardHeader, CardTitle } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { useActionLock } from '@/shared/lib/use-action-lock'
import { SelectField } from '@/shared/ui/form'

import {
  changeInterventionIntake,
  createInterventionInvite,
  listInterventionIntake,
  loadInterventionPhoto,
} from '../application/intervention-intake-actions'

const statusLabels = {
  pending: 'Pendiente de revisar',
  reviewed: 'Revisada',
  dismissed: 'Descartada',
}
const confirmation = {
  revoke: 'Revocar enlace',
  reviewed: 'Confirmar revisión',
  dismissed: 'Descartar solicitud',
} as const
type Action = keyof typeof confirmation

export function InterventionIntakePanel({
  tenantId,
  clientId,
  userId,
  centres,
}: {
  tenantId: string
  clientId: string
  userId: string
  centres: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [centreId, setCentreId] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<{ id: string; action: Action } | null>(null)
  const linkInput = useRef<HTMLInputElement>(null)
  const lock = useActionLock()
  const requests = useQuery({
    queryKey: ['intervention-intake', tenantId, userId, clientId],
    queryFn: () => listInterventionIntake(tenantId, clientId),
    enabled: open,
    gcTime: 0,
    refetchOnMount: 'always',
  })

  async function perform(action: () => Promise<void>) {
    if (!lock.acquire()) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      await requests.refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción.')
    } finally {
      setBusy(false)
      lock.release()
    }
  }
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>Solicitudes de intervención</h2>
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          Facilita un enlace para recibir una dirección, disponibilidad y fotos opcionales. No crea
          una visita.
        </p>
        <Button
          variant="outline"
          className="min-h-11 self-start"
          aria-expanded={open}
          onPress={() => {
            if (open) {
              setLink('')
              setConfirm(null)
            }
            setOpen((previous) => !previous)
          }}
        >
          {open ? 'Ocultar solicitudes' : 'Gestionar solicitudes'}
        </Button>
      </CardHeader>
      {open ? (
        <CardContent className="min-w-0 space-y-3">
          <SelectField
            label="Centro del enlace"
            value={centreId}
            onChange={setCentreId}
            options={[
              { value: '', label: 'Sin centro preasignado' },
              ...centres.map((centre) => ({ value: centre.id, label: centre.name })),
            ]}
          />
          <Button
            className="min-h-11"
            isDisabled={busy}
            onPress={() =>
              void perform(async () => {
                const invitation = await createInterventionInvite(
                  tenantId,
                  clientId,
                  centreId || null,
                )
                setLink(new URL(`/solicitud#${invitation.token}`, location.origin).href)
                setNotice(
                  'Enlace creado. Caduca en 72 horas, admite una sola solicitud y no se ha enviado.',
                )
              })
            }
          >
            Generar enlace de una solicitud
          </Button>
          {link ? (
            <div className="min-w-0 space-y-2">
              <label className="block text-sm">
                Enlace privado para copiar ahora
                <input
                  ref={linkInput}
                  readOnly
                  value={link}
                  className="border-border block min-h-11 w-full min-w-0 rounded border p-2"
                />
              </label>
              <Button
                variant="outline"
                className="min-h-11"
                onPress={() => {
                  void (
                    navigator.clipboard?.writeText(link) ??
                    Promise.reject(new Error('No clipboard'))
                  )
                    .then(() => {
                      setNotice('Enlace copiado. Compártelo solo con el destinatario.')
                    })
                    .catch(() => {
                      linkInput.current?.select()
                      setNotice('Seleccionado para copiar.')
                    })
                }}
              >
                Copiar enlace privado
              </Button>
            </div>
          ) : null}
          <output className="text-muted-foreground block text-sm empty:sr-only">{notice}</output>
          {error || requests.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {error || 'No se pudo cargar el listado.'}
            </p>
          ) : null}
          {requests.isError ? (
            <Button variant="ghost" onPress={() => void requests.refetch()}>
              Volver a cargar
            </Button>
          ) : null}
          {requests.isPending ? <output>Cargando solicitudes…</output> : null}
          {requests.data?.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aún no hay enlaces ni solicitudes.</p>
          ) : null}
          <ul className="space-y-2">
            {requests.data?.map((item) => {
              const pending = item.request?.status === 'pending'
              const active =
                !item.revoked_at && Date.parse(item.expires_at) > requests.dataUpdatedAt
              return (
                <li
                  key={item.id}
                  className="border-border min-w-0 space-y-2 rounded-lg border p-3 text-sm"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="font-medium">{item.centre_name || 'Sin centro preasignado'}</p>
                    <p>
                      {item.request
                        ? statusLabels[item.request.status]
                        : item.revoked_at
                          ? 'Revocado'
                          : active
                            ? 'Enlace activo'
                            : 'Caducado'}
                    </p>
                  </div>
                  {item.request ? (
                    <>
                      <dl className="space-y-1">
                        <dt className="text-muted-foreground">Dirección facilitada</dt>
                        <dd className="wrap-anywhere whitespace-pre-wrap">
                          {item.request.address}
                        </dd>
                        <dt className="text-muted-foreground">Disponibilidad aproximada</dt>
                        <dd className="wrap-anywhere whitespace-pre-wrap">
                          {item.request.availability}
                        </dd>
                      </dl>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {item.request.photo_ids.map((id, index) => (
                          <PrivatePhoto
                            key={id}
                            tenantId={tenantId}
                            userId={userId}
                            photoId={id}
                            number={index + 1}
                          />
                        ))}
                      </div>
                      {pending ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-11"
                            isDisabled={busy}
                            onPress={() => setConfirm({ id: item.id, action: 'reviewed' })}
                          >
                            Marcar revisada
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="min-h-11"
                            isDisabled={busy}
                            onPress={() => setConfirm({ id: item.id, action: 'dismissed' })}
                          >
                            Descartar…
                          </Button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <p className="text-muted-foreground">
                        Caduca: {new Date(item.expires_at).toLocaleString('es-ES')}
                      </p>
                      {active ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-11"
                          isDisabled={busy}
                          onPress={() => setConfirm({ id: item.id, action: 'revoke' })}
                        >
                          Revocar enlace…
                        </Button>
                      ) : null}
                    </>
                  )}
                  {confirm?.id === item.id ? (
                    <div className="bg-muted space-y-2 rounded-md p-2">
                      <p>
                        Confirma el cambio. No se reservará ninguna visita ni se eliminarán los
                        datos.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="min-h-11"
                          isDisabled={busy}
                          onPress={() =>
                            void perform(async () => {
                              await changeInterventionIntake(tenantId, item.id, confirm.action)
                              setLink('')
                              setConfirm(null)
                              setNotice('Cambio confirmado.')
                            })
                          }
                        >
                          {confirmation[confirm.action]}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="min-h-11"
                          isDisabled={busy}
                          onPress={() => setConfirm(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  )
}

function PrivatePhoto({
  tenantId,
  photoId,
  userId,
  number,
}: {
  tenantId: string
  photoId: string
  userId: string
  number: number
}) {
  const [opened, setOpened] = useState(false)
  const [url, setUrl] = useState('')
  const photo = useQuery({
    queryKey: ['intervention-photo', tenantId, userId, photoId],
    queryFn: () => loadInterventionPhoto(tenantId, photoId),
    enabled: opened,
    gcTime: 0,
  })
  useEffect(() => {
    if (!opened || !photo.data) return
    const next = URL.createObjectURL(photo.data)
    // Allocate and revoke a browser-local URL only for the currently opened photo.
    // oxlint-disable-next-line react/set-state-in-effect
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [opened, photo.data])
  return (
    <div className="min-w-0 space-y-2">
      <Button
        size="sm"
        className="min-h-11"
        variant="outline"
        aria-expanded={opened}
        onPress={() => setOpened(!opened)}
      >
        {opened ? 'Cerrar' : 'Ver'} foto {number}
      </Button>
      {opened && photo.isPending ? <output>Cargando foto…</output> : null}
      {opened && photo.isError ? <p role="alert">No se pudo abrir la foto.</p> : null}
      {opened && photo.data && url ? (
        <img
          className="max-h-48 w-full object-contain"
          alt={`Foto de la solicitud ${number}`}
          src={url}
        />
      ) : null}
    </div>
  )
}
