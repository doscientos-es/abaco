import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { useActionLock } from '@/shared/lib/use-action-lock'
import { TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import { loadCentreProtocol, saveCentreProtocol } from '../application/office-protocol'
import {
  maxProtocolItemLength,
  maxProtocolRows,
  protocolItems,
  protocolValidation,
  type OfficeCentreProtocol,
} from '../domain/centre-protocol'

type Props = {
  tenantId: string
  userId: string
  locationId: string
  locationName: string
  onClose: () => void
}

const officeKey = (tenantId: string, userId: string, locationId: string) =>
  ['centre-protocol-office', tenantId, userId, locationId] as const

export function CentreProtocolDialog(props: Props) {
  const { tenantId, userId, locationId, locationName, onClose } = props
  const record = useQuery({
    queryKey: officeKey(tenantId, userId, locationId),
    queryFn: () => loadCentreProtocol(tenantId, locationId),
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  })
  if (record.isSuccess && record.isFetchedAfterMount && !record.isFetching)
    return (
      <ProtocolForm
        key={record.data?.revision ?? 0}
        {...props}
        initial={record.data ?? { revision: 0, items: [], shared: false }}
      />
    )
  return (
    <FormDialog
      open
      title={`Protocolo · ${locationName}`}
      submitLabel="Guardar protocolo"
      submitDisabled
      onSubmit={() => undefined}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {record.isError || record.isPaused ? (
        <div role="alert" className="space-y-2 sm:col-span-2">
          <p>No se pudo consultar el protocolo.</p>
          <Button variant="outline" onPress={() => void record.refetch()}>
            Reintentar protocolo
          </Button>
        </div>
      ) : (
        <output className="text-muted-foreground sm:col-span-2">Cargando protocolo…</output>
      )}
    </FormDialog>
  )
}

function ProtocolForm({
  tenantId,
  userId,
  locationId,
  locationName,
  onClose,
  initial,
}: Props & { initial: OfficeCentreProtocol }) {
  const queryClient = useQueryClient()
  const lock = useActionLock()
  const operations = useRef(new Map<string, string>())
  const [rows, setRows] = useState(() =>
    Array.from({ length: maxProtocolRows }, (_, index) => initial.items[index] ?? ''),
  )
  const [shared, setShared] = useState(initial.shared)
  const [reviewed, setReviewed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const items = protocolItems(rows)
  const dirtyItems =
    items.length !== initial.items.length ||
    items.some((value, index) => value !== initial.items[index])
  const dirty = dirtyItems || shared !== initial.shared
  const validation = protocolValidation(items, shared)
  const needsConfirmation = (items.length > 0 && dirtyItems) || (shared && !initial.shared)
  const canSave = dirty && !validation && (!needsConfirmation || reviewed)

  async function submit() {
    if (!canSave || !lock.acquire()) return
    const fingerprint = JSON.stringify([items, shared, initial.revision])
    const operationId = operations.current.get(fingerprint) ?? crypto.randomUUID()
    operations.current.set(fingerprint, operationId)
    setError('')
    setSaving(true)
    try {
      await saveCentreProtocol({
        tenantId,
        locationId,
        expected: initial.revision,
        items,
        shared,
        reviewed,
        operationId,
      })
      operations.current.delete(fingerprint)
      void queryClient.invalidateQueries({ queryKey: officeKey(tenantId, userId, locationId) })
      void queryClient.invalidateQueries({ queryKey: ['assigned-centre-protocols', tenantId] })
      toast.success(
        shared
          ? 'Protocolo compartido'
          : initial.shared
            ? 'Protocolo retirado'
            : 'Borrador guardado',
      )
      onClose()
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message === 'conflict'
          ? 'El protocolo cambió. Cierra y vuelve a abrir el editor para ver la versión actual.'
          : 'No se pudo guardar. Inténtalo de nuevo.',
      )
    } finally {
      setSaving(false)
      lock.release()
    }
  }

  return (
    <FormDialog
      open
      title={`Protocolo · ${locationName}`}
      description="Indicaciones para preparar o realizar el servicio. La ficha de llegada, las notas privadas y los partes no se modifican."
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      isDirty={dirty}
      isSubmitting={saving}
      onSubmit={() => void submit()}
      submitLabel={
        shared ? 'Compartir protocolo' : initial.shared ? 'Retirar protocolo' : 'Guardar borrador'
      }
      submitDisabled={!canSave}
    >
      <p className="text-muted-foreground text-sm sm:col-span-2">
        {initial.shared ? 'Compartido con el personal asignado.' : 'No visible para el personal.'}{' '}
        Puedes dejar indicaciones vacías.
      </p>
      <p className="border-warning rounded-md border p-2.5 text-sm sm:col-span-2">
        Usa solo instrucciones de trabajo. No guardes llaves, PIN, contraseñas, códigos de acceso ni
        datos personales.
      </p>
      {rows.map((row, index) => (
        <TextField
          key={index}
          label={`Indicación ${index + 1}`}
          value={row}
          maxLength={maxProtocolItemLength}
          className="sm:col-span-2"
          placeholder={index === 0 ? 'Ej.: comprobar el cuadro antes de iniciar' : 'Opcional'}
          onChange={(value) => {
            setRows((old) => old.map((item, offset) => (index === offset ? value : item)))
            setReviewed(false)
            setError('')
          }}
        />
      ))}
      <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          checked={shared}
          onChange={(event) => {
            setShared(event.target.checked)
            setReviewed(false)
          }}
        />
        Compartir con personal asignado
      </label>
      {initial.shared && !shared ? (
        <p className="text-sm sm:col-span-2">
          Al guardar se dejará de mostrar el protocolo. Las indicaciones se conservan como borrador.
        </p>
      ) : null}
      {needsConfirmation ? (
        <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(event) => setReviewed(event.target.checked)}
          />
          Confirmo que solo son indicaciones de trabajo y no contienen credenciales ni datos
          privados
        </label>
      ) : null}
      {error || validation ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-2">
          {error || validation}
        </p>
      ) : null}
    </FormDialog>
  )
}
