import {
  Button,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'

import {
  createClientPortalGrant,
  createPortalSecret,
  listClientPortalOptions,
  revokeClientPortalGrant,
  type PortalActiveLink,
} from '../application/customer-portal-actions'
import { portalDocumentLimit, portalPath, portalVisitLimit } from '../domain/customer-portal'
import {
  CustomerPortalContent,
  formatPortalDate,
  portalVisitRange,
} from './customer-portal-content'

type Props = { tenantId: string; clientId: string }

export function CustomerPortalManager({ tenantId, clientId }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger variant="outline" className="min-h-11">
        Portal de cliente
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="app-dialog max-h-[90dvh] w-full overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>Compartir portal de cliente</DialogTitle>
          <DialogDescription>
            Antes de crear el enlace, elige lo que podrá leer la persona que lo reciba. Dura 24
            horas y no se envía automáticamente.
          </DialogDescription>
        </DialogHeader>
        {open ? <PortalManagerForm tenantId={tenantId} clientId={clientId} /> : null}
        <DialogFooter>
          <DialogClose variant="outline" className="min-h-11">
            Cerrar
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  )
}

function PortalManagerForm({ tenantId, clientId }: Props) {
  const [visitIds, setVisitIds] = useState<string[]>([])
  const [documentIds, setDocumentIds] = useState<string[]>([])
  const [step, setStep] = useState<'select' | 'preview' | 'created'>('select')
  const [issued, setIssued] = useState<{ grant: PortalActiveLink; url: string } | null>(null)
  const [revokeId, setRevokeId] = useState<string>()
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const linkedHeadingRef = useRef<HTMLHeadingElement>(null)
  const activeHeadingRef = useRef<HTMLHeadingElement>(null)
  const revokePromptRef = useRef<HTMLParagraphElement>(null)
  const previewButtonRef = useRef<HTMLButtonElement>(null)
  const previewTitle = useId()
  const options = useQuery({
    queryKey: ['client-portal-options', tenantId, clientId],
    queryFn: () => listClientPortalOptions(tenantId, clientId),
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const activeLinks = options.data?.activeLinks ?? []
  const issuedIsBlocked =
    options.data?.clientActive === false ||
    Boolean(issued && activeLinks.find((item) => item.id === issued.grant.id)?.blockedAt)

  const selectedVisits = (options.data?.visits ?? []).filter(({ id }) => visitIds.includes(id))
  const selectedDocuments = (options.data?.documents ?? []).filter(({ id }) =>
    documentIds.includes(id),
  )
  const valid =
    options.data?.clientActive &&
    !options.isFetching &&
    !options.isError &&
    selectedVisits.length === visitIds.length &&
    selectedDocuments.length === documentIds.length &&
    visitIds.length + documentIds.length > 0

  function toggle(ids: string[], id: string, limit: number, set: (items: string[]) => void) {
    if (ids.includes(id)) set(ids.filter((item) => item !== id))
    else if (ids.length < limit) set([...ids, id])
  }

  function preview() {
    if (!valid || busy) return
    setError('')
    setStep('preview')
    requestAnimationFrame(() => document.getElementById(previewTitle)?.focus())
  }

  async function issue() {
    if (!valid || step !== 'preview' || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const secret = await createPortalSecret()
      const grant = await createClientPortalGrant(
        tenantId,
        clientId,
        secret.hash,
        visitIds,
        documentIds,
      )
      const url = new URL(portalPath, window.location.origin)
      url.hash = `token=${secret.token}`
      setIssued({ grant, url: url.href })
      setStep('created')
      requestAnimationFrame(() => linkedHeadingRef.current?.focus())
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'No se pudo confirmar la creación del enlace.',
      )
      setStep('select')
      setVisitIds([])
      setDocumentIds([])
      requestAnimationFrame(() => previewButtonRef.current?.focus())
    } finally {
      await options.refetch()
      inFlight.current = false
      setBusy(false)
    }
  }

  async function revoke() {
    if (!revokeId || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await revokeClientPortalGrant(tenantId, clientId, revokeId)
      if (issued?.grant.id === revokeId) {
        setIssued(null)
        setStep('select')
        setVisitIds([])
        setDocumentIds([])
      }
      setRevokeId(undefined)
      setNotice('El enlace ya no está disponible.')
      requestAnimationFrame(() => activeHeadingRef.current?.focus())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo revocar el enlace.')
    } finally {
      await options.refetch()
      inFlight.current = false
      setBusy(false)
    }
  }

  async function copy() {
    if (!issued || issuedIsBlocked) return
    if (Date.parse(issued.grant.expiresAt) <= Date.now()) {
      setIssued(null)
      setStep('select')
      setNotice('El enlace ha caducado. Crea uno nuevo si lo necesitas.')
      return
    }
    try {
      await navigator.clipboard.writeText(issued.url)
      setNotice('Enlace copiado. No se ha enviado a nadie.')
    } catch {
      setNotice('No se pudo usar el portapapeles. Selecciona y copia el enlace del campo.')
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {notice ? <output className="block text-sm">{notice}</output> : null}
      {options.isPending ? (
        <output className="block text-sm">Cargando opciones para compartir…</output>
      ) : null}
      {options.isError ? (
        <div className="space-y-2">
          <p role="alert">No se pudieron consultar las opciones o enlaces activos.</p>
          <Button variant="outline" onPress={() => void options.refetch()} className="min-h-11">
            Volver a intentar
          </Button>
        </div>
      ) : null}

      {options.data?.clientActive === false ? (
        <p role="note" className="text-sm">
          El cliente está archivado. Los enlaces que tenía ya no permiten ver contenido. Puedes
          revocarlos, pero no se puede crear otro hasta restaurar al cliente.
        </p>
      ) : null}

      {options.data?.clientActive && step === 'select' ? (
        <div className="space-y-4">
          <fieldset
            disabled={busy}
            className="border-border min-w-0 space-y-2 rounded-md border p-3"
          >
            <legend className="px-1 font-medium">Visitas para compartir</legend>
            <p className="text-muted-foreground text-sm">
              Próximas visitas de los siguientes 60 días, o visitas ahora en curso.
            </p>
            {options.data.visits.length === 0 ? (
              <p className="text-sm">No hay visitas disponibles.</p>
            ) : (
              <div className="divide-border max-h-52 divide-y overflow-y-auto">
                {options.data.visits.map((visit) => (
                  <PortalPickerItem
                    key={visit.id}
                    label={visit.officeTitle}
                    detail={portalVisitRange(visit)}
                    selected={visitIds.includes(visit.id)}
                    disabled={!visitIds.includes(visit.id) && visitIds.length >= portalVisitLimit}
                    onChange={() => toggle(visitIds, visit.id, portalVisitLimit, setVisitIds)}
                  />
                ))}
              </div>
            )}
          </fieldset>
          <fieldset
            disabled={busy}
            className="border-border min-w-0 space-y-2 rounded-md border p-3"
          >
            <legend className="px-1 font-medium">Resúmenes de servicio</legend>
            <p className="text-muted-foreground text-sm">
              Versiones cerradas en los últimos 90 días. No se comparte el parte original.
            </p>
            {options.data.documents.length === 0 ? (
              <p className="text-sm">No hay resúmenes disponibles.</p>
            ) : (
              <div className="divide-border max-h-52 divide-y overflow-y-auto">
                {options.data.documents.map(({ id, officeTitle, document }) => (
                  <PortalPickerItem
                    key={id}
                    label={officeTitle}
                    detail={`Versión ${document.version} · ${formatPortalDate(document.closedAt)}`}
                    selected={documentIds.includes(id)}
                    disabled={
                      !documentIds.includes(id) && documentIds.length >= portalDocumentLimit
                    }
                    onChange={() => toggle(documentIds, id, portalDocumentLimit, setDocumentIds)}
                  />
                ))}
              </div>
            )}
          </fieldset>
          <Button
            ref={previewButtonRef}
            onPress={preview}
            isDisabled={!valid || busy}
            className="min-h-11"
          >
            Revisar vista previa
          </Button>
          <p className="text-muted-foreground text-sm">
            Máximo 20 visitas y 10 resúmenes por enlace.
          </p>
        </div>
      ) : null}

      {step === 'preview' ? (
        <section aria-labelledby={previewTitle} className="min-w-0 space-y-3">
          <h2 id={previewTitle} tabIndex={-1} className="font-semibold">
            Así lo verá el cliente
          </h2>
          <CustomerPortalContent
            visits={selectedVisits}
            documents={selectedDocuments.map(({ document }) => document)}
          />
          <p className="text-muted-foreground text-sm">
            Solo se comparten las visitas seleccionadas. Sus horarios y estado se actualizan; los
            resúmenes conservan la versión elegida. Cualquiera que tenga el enlace podrá consultar
            este contenido hasta que caduque o lo revoques.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              isDisabled={busy}
              onPress={() => {
                setStep('select')
                requestAnimationFrame(() => previewButtonRef.current?.focus())
              }}
              className="min-h-11"
            >
              Editar selección
            </Button>
            <Button isDisabled={!valid || busy} onPress={() => void issue()} className="min-h-11">
              {busy ? 'Creando…' : 'Crear enlace de 24 horas'}
            </Button>
          </div>
        </section>
      ) : null}

      {step === 'created' && issued && !issuedIsBlocked ? (
        <section className="min-w-0 space-y-2" aria-label="Enlace creado">
          <h2 ref={linkedHeadingRef} tabIndex={-1} className="font-semibold">
            Enlace creado
          </h2>
          <p className="text-muted-foreground text-sm">
            Cópialo antes de cerrar. No podrás recuperar el enlace desde la lista de activos.
          </p>
          <label className="block text-sm font-medium">
            Enlace temporal para el cliente
            <input
              readOnly
              autoComplete="off"
              spellCheck={false}
              value={issued.url}
              onFocus={(event) => event.currentTarget.select()}
              className="border-input bg-background mt-1 min-h-11 w-full min-w-0 rounded-md border px-2 text-base"
            />
          </label>
          <Button onPress={() => void copy()} className="min-h-11">
            Copiar enlace
          </Button>
        </section>
      ) : null}

      {options.data ? (
        <section aria-label="Enlaces compartidos" className="border-border space-y-2 border-t pt-3">
          <h2 ref={activeHeadingRef} tabIndex={-1} className="font-semibold">
            Enlaces compartidos
          </h2>
          {activeLinks.length === 0 ? (
            <p className="text-muted-foreground text-sm">No hay enlaces activos.</p>
          ) : (
            <ul className="space-y-2">
              {activeLinks.map((link) => (
                <li key={link.id} className="border-border space-y-2 rounded-md border p-2 text-sm">
                  {link.blockedAt ? <p className="font-medium">Bloqueado al archivar</p> : null}
                  <p>
                    Creado: {formatPortalDate(link.createdAt)} · Caduca:{' '}
                    {formatPortalDate(link.expiresAt)}
                  </p>
                  {revokeId === link.id ? (
                    <div className="space-y-2">
                      <p ref={revokePromptRef} tabIndex={-1}>
                        Dejará de estar disponible para quien lo tenga.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onPress={() => {
                            setRevokeId(undefined)
                            requestAnimationFrame(() => activeHeadingRef.current?.focus())
                          }}
                          isDisabled={busy}
                          className="min-h-11"
                        >
                          Cancelar
                        </Button>
                        <Button
                          variant="destructive"
                          onPress={() => void revoke()}
                          isDisabled={busy}
                          className="min-h-11"
                        >
                          Confirmar revocación
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      onPress={() => {
                        setRevokeId(link.id)
                        requestAnimationFrame(() => revokePromptRef.current?.focus())
                      }}
                      isDisabled={busy}
                      className="min-h-11"
                      aria-label={`Revocar enlace creado el ${formatPortalDate(link.createdAt)}`}
                    >
                      Revocar enlace
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  )
}

function PortalPickerItem({
  label,
  detail,
  selected,
  disabled,
  onChange,
}: {
  label: string
  detail: string
  selected: boolean
  disabled: boolean
  onChange: () => void
}) {
  const titleId = useId()
  return (
    <label aria-labelledby={titleId} className="flex min-h-11 min-w-0 items-start gap-2 py-2">
      <input
        type="checkbox"
        checked={selected}
        onChange={onChange}
        disabled={disabled}
        className="accent-primary mt-1 size-4 shrink-0"
      />
      <span id={titleId} className="min-w-0 text-sm wrap-anywhere">
        <span className="block font-medium">{label}</span>
        <span className="text-muted-foreground">{detail}</span>
      </span>
    </label>
  )
}
