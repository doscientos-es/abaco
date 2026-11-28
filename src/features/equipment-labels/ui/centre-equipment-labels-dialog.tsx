import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { printDocument } from '@/shared/lib/print-document'
import { useActionLock } from '@/shared/lib/use-action-lock'
import { CalendarDetailsDialog } from '@/shared/ui/calendar-details-dialog'

import {
  changeEquipmentLabel,
  officeEquipmentLabelsKey,
  officeEquipmentLabelsQuery,
} from '../application/equipment-label-queries'
import {
  equipmentScanUrl,
  equipmentSubtitle,
  type LabelAction,
  type LabelOption,
} from '../domain/equipment-label'
import { EquipmentLabelCode } from './equipment-label-code'
import { RegisterEquipmentForm } from './register-equipment-form'

type Props = {
  tenantId: string
  userId: string
  locationId: string
  name: string
  onClose: () => void
}

function focusRegistrationStatus(node: HTMLOutputElement | null) {
  node?.focus()
}

export default function CentreEquipmentLabelsDialog({
  tenantId,
  userId,
  locationId,
  name,
  onClose,
}: Props) {
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const client = useQueryClient()
  const query = useQuery(officeEquipmentLabelsQuery(tenantId, userId, locationId, page))
  const selectedRow = query.data?.rows.find((row) => row.equipment_id === selected)
  return (
    <CalendarDetailsDialog
      title={`Etiquetas QR · ${name}`}
      description="Las etiquetas identifican equipos instalados. Escanear no concede permisos ni muestra datos sin iniciar sesión."
      onClose={onClose}
      preventDismissal={busy}
    >
      {query.isPending ? <output>Cargando equipos del centro…</output> : null}
      {query.isError ? (
        <div role="alert" className="space-y-2">
          <p>No se pudieron cargar los equipos de este centro.</p>
          <Button variant="outline" className="min-h-11" onPress={() => void query.refetch()}>
            Reintentar equipos
          </Button>
        </div>
      ) : null}
      {query.isSuccess && !query.data.rows.length ? (
        <p className="text-muted-foreground text-sm">
          No hay equipos instalados activos para etiquetar en este centro.
        </p>
      ) : null}
      {query.isSuccess ? (
        <Button
          variant="outline"
          className="min-h-11"
          isDisabled={busy}
          aria-expanded={registering}
          onPress={() => {
            setSelected(null)
            setAnnouncement('')
            setRegistering(!registering)
          }}
        >
          {registering ? 'Cerrar registro' : 'Registrar equipo para etiquetar'}
        </Button>
      ) : null}
      {registering ? (
        <RegisterEquipmentForm
          tenantId={tenantId}
          userId={userId}
          locationId={locationId}
          onBusyChange={setBusy}
          onRegistered={async (id) => {
            setPage(0)
            setSelected(id)
            setRegistering(false)
            await client.invalidateQueries({
              queryKey: officeEquipmentLabelsKey(tenantId, userId, locationId),
            })
            setAnnouncement('Equipo registrado. Ya puedes preparar su etiqueta.')
          }}
        />
      ) : null}
      {announcement ? (
        <output ref={focusRegistrationStatus} tabIndex={-1} className="block text-sm">
          {announcement}
        </output>
      ) : null}
      {query.isSuccess ? (
        <ul className="divide-border divide-y">
          {query.data.rows.map((row) => (
            <li key={row.equipment_id} className="min-w-0 space-y-2 py-2">
              <div className="flex flex-wrap justify-between gap-2">
                <div className="min-w-0 flex-1 basis-32 break-words">
                  <p className="font-semibold">{row.kind}</p>
                  <p className="text-muted-foreground text-sm">
                    {equipmentSubtitle(row) || 'Sin marca o modelo'} ·{' '}
                    {row.token ? 'Etiqueta activa' : 'Sin etiqueta activa'}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  isDisabled={busy || registering}
                  aria-label={`Etiqueta de ${row.kind}`}
                  aria-expanded={selectedRow?.equipment_id === row.equipment_id}
                  onPress={() =>
                    setSelected(selected === row.equipment_id ? null : row.equipment_id)
                  }
                >
                  {selectedRow?.equipment_id === row.equipment_id
                    ? 'Ocultar'
                    : 'Configurar etiqueta'}
                </Button>
              </div>
              {selectedRow?.equipment_id === row.equipment_id ? (
                <EquipmentLabelForm
                  key={row.revision}
                  tenantId={tenantId}
                  userId={userId}
                  locationId={locationId}
                  row={row}
                  onBusyChange={setBusy}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {page > 0 || query.data?.hasMore ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="min-h-11"
            isDisabled={page === 0 || busy}
            onPress={() => {
              setSelected(null)
              setPage(page - 1)
            }}
          >
            Anterior
          </Button>
          <span className="text-sm">Página {page + 1}</span>
          <Button
            size="sm"
            variant="outline"
            className="min-h-11"
            isDisabled={!query.data?.hasMore || busy}
            onPress={() => {
              setSelected(null)
              setPage(page + 1)
            }}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </CalendarDetailsDialog>
  )
}

function EquipmentLabelForm({
  tenantId,
  userId,
  locationId,
  row,
  onBusyChange,
}: {
  tenantId: string
  userId: string
  locationId: string
  row: LabelOption
  onBusyChange: (busy: boolean) => void
}) {
  const client = useQueryClient()
  const lock = useActionLock()
  const ops = useRef(new Map<LabelAction, string>())
  const [requested, setRequested] = useState<'rotate' | 'revoke' | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState('')
  const [printing, setPrinting] = useState(false)
  const label = useRef<HTMLDivElement>(null)
  const url = row.token ? equipmentScanUrl(window.location.origin, row.token) : null
  const key = officeEquipmentLabelsKey(tenantId, userId, locationId)

  async function change(action: LabelAction) {
    if (!lock.acquire()) return
    setBusy(true)
    onBusyChange(true)
    setError('')
    const operationId = ops.current.get(action) ?? crypto.randomUUID()
    ops.current.set(action, operationId)
    try {
      await changeEquipmentLabel({
        tenantId,
        locationId,
        equipmentId: row.equipment_id,
        expected: row.revision,
        action,
        operationId,
      })
      ops.current.delete(action)
      setRequested(null)
      await client.invalidateQueries({ queryKey: key })
      await client.invalidateQueries({ queryKey: ['equipment-label-scan', tenantId] })
      toast.success(action === 'revoke' ? 'Etiqueta retirada' : 'Etiqueta preparada')
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message === 'conflict'
          ? 'La etiqueta ha cambiado. Actualiza los datos.'
          : 'No se pudo guardar la etiqueta. Puedes reintentar.',
      )
    } finally {
      setBusy(false)
      onBusyChange(false)
      lock.release()
    }
  }

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied('Enlace copiado.')
    } catch {
      setCopied('No se pudo copiar automáticamente. Selecciona y copia el enlace mostrado.')
    }
  }

  async function print() {
    if (!label.current || printing) return
    setPrinting(true)
    try {
      await printDocument(label.current, 'Etiqueta de equipo · Menos Líos')
    } catch {
      setError('No se pudo preparar la etiqueta para imprimir.')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="bg-muted/40 min-w-0 space-y-3 rounded-lg border p-3">
      {url ? (
        <>
          <div
            ref={label}
            style={{
              width: '52mm',
              maxWidth: '100%',
              color: '#111',
              background: 'white',
              padding: '2mm',
              textAlign: 'center',
              breakInside: 'avoid',
            }}
          >
            <EquipmentLabelCode url={url} />
            <p style={{ margin: '0', fontSize: '10pt' }}>Equipo · Menos Líos</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="min-h-11"
              isDisabled={printing || busy || Boolean(requested)}
              onPress={() => void print()}
            >
              Imprimir etiqueta
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11"
              isDisabled={busy}
              onPress={() => void copy()}
            >
              Copiar enlace
            </Button>
            <a
              href={url}
              className="text-primary focus-visible:ring-ring inline-flex min-h-11 items-center rounded px-2 text-sm underline focus-visible:ring-2"
            >
              Abrir enlace
            </a>
          </div>
          <label className="grid gap-1 text-xs">
            Enlace de la etiqueta
            <input
              readOnly
              value={url}
              onFocus={(event) => event.currentTarget.select()}
              className="bg-background border-border min-h-11 w-full min-w-0 rounded border px-2 text-sm"
            />
          </label>
          <output className="text-muted-foreground text-sm">{copied}</output>
          {!requested ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="min-h-11"
                isDisabled={busy}
                onPress={() => setRequested('rotate')}
              >
                Sustituir etiqueta
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-11"
                isDisabled={busy}
                onPress={() => setRequested('revoke')}
              >
                Retirar etiqueta
              </Button>
            </div>
          ) : (
            <div className="space-y-2 border-t pt-2">
              <p className="text-sm">
                Las copias impresas de la etiqueta actual dejarán de funcionar.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="min-h-11"
                  isDisabled={busy}
                  onPress={() => void change(requested)}
                >
                  {requested === 'rotate' ? 'Confirmar sustitución' : 'Confirmar retirada'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  isDisabled={busy}
                  onPress={() => setRequested(null)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <Button
          size="sm"
          className="min-h-11"
          isDisabled={busy}
          onPress={() => void change('issue')}
        >
          Crear etiqueta QR
        </Button>
      )}
      {error ? (
        <div role="alert" className="space-y-1">
          <p>{error}</p>
          <Button
            variant="outline"
            size="sm"
            onPress={() => void client.invalidateQueries({ queryKey: key })}
          >
            Actualizar datos
          </Button>
        </div>
      ) : null}
    </div>
  )
}
