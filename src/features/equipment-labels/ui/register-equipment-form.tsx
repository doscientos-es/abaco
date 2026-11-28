import { Button } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useRef, useState } from 'react'

import { useActionLock } from '@/shared/lib/use-action-lock'

import {
  registerEquipmentForQr,
  registrationAssetsQuery,
} from '../application/equipment-label-queries'

function trimmedField(body: FormData, key: string) {
  const value = body.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

export function RegisterEquipmentForm({
  tenantId,
  userId,
  locationId,
  onBusyChange,
  onRegistered,
}: {
  tenantId: string
  userId: string
  locationId: string
  onBusyChange: (busy: boolean) => void
  onRegistered: (equipmentId: string) => Promise<void>
}) {
  const [page, setPage] = useState(0)
  const [assetId, setAssetId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const operations = useRef(new Map<string, string>())
  const lock = useActionLock()
  const assets = useQuery(registrationAssetsQuery(tenantId, userId, locationId, page))
  const selected = assets.data?.rows.some((asset) => asset.id === assetId)
  const inputClass =
    'border-input bg-background focus-visible:ring-ring min-h-11 w-full rounded-md border px-3 focus-visible:ring-2'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !lock.acquire()) return
    setBusy(true)
    onBusyChange(true)
    setError('')
    const body = new FormData(event.currentTarget)
    const kind = trimmedField(body, 'kind')
    const manufacturer = trimmedField(body, 'manufacturer')
    const model = trimmedField(body, 'model')
    const confirmed = body.get('confirmed') === 'on'
    try {
      if (!kind || !confirmed) {
        setError('Indica el tipo de equipo y confirma que es un equipo físico.')
        return
      }
      const fingerprint = JSON.stringify([assetId, kind, manufacturer, model])
      const operationId = operations.current.get(fingerprint) ?? crypto.randomUUID()
      operations.current.set(fingerprint, operationId)
      const equipmentId = await registerEquipmentForQr({
        tenantId,
        locationId,
        assetId,
        kind,
        manufacturer,
        model,
        confirmed,
        operationId,
      })
      await onRegistered(equipmentId)
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message === 'asset_unavailable'
          ? 'El activo ya no está operativo en este centro. Actualiza la lista.'
          : 'No se pudo registrar el equipo. Puedes reintentar sin duplicarlo.',
      )
    } finally {
      setBusy(false)
      onBusyChange(false)
      lock.release()
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="border-border space-y-3 rounded-md border p-3"
    >
      <p className="text-muted-foreground text-sm">
        El activo es la instalación a la que se asignan las visitas. Registra solo el equipo físico
        donde pegarás la etiqueta, no el centro ni la instalación entera.
      </p>
      {assets.isPending ? <output>Cargando activos del centro…</output> : null}
      {assets.isError ? <p role="alert">No se pudieron cargar los activos del centro.</p> : null}
      {assets.isSuccess && !assets.data.rows.length ? (
        <p>No hay activos en servicio para registrar un equipo en este centro.</p>
      ) : null}
      {assets.isError || !assets.data?.rows.length ? (
        <Button variant="outline" onPress={() => void assets.refetch()}>
          Actualizar activos
        </Button>
      ) : null}
      {assets.isSuccess && assets.data.rows.length ? (
        <fieldset disabled={busy} className="min-w-0 space-y-3">
          <label className="block space-y-1 text-sm font-medium">
            <span>Activo en servicio</span>
            <select
              className={inputClass}
              value={assetId}
              required
              onChange={(event) => setAssetId(event.currentTarget.value)}
            >
              <option value="">Elige el activo</option>
              {assets.data.rows.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </select>
          </label>
          {page > 0 || assets.data.hasMore ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className="min-h-11"
                isDisabled={page === 0}
                onPress={() => {
                  setAssetId('')
                  setPage(page - 1)
                }}
              >
                Activos anteriores
              </Button>
              <span className="text-sm">Página {page + 1}</span>
              <Button
                variant="outline"
                className="min-h-11"
                isDisabled={!assets.data.hasMore}
                onPress={() => {
                  setAssetId('')
                  setPage(page + 1)
                }}
              >
                Más activos
              </Button>
            </div>
          ) : null}
          <label className="block space-y-1 text-sm font-medium">
            <span>Tipo de equipo</span>
            <input
              name="kind"
              className={inputClass}
              placeholder="Ej. Bomba de impulsión"
              required
              maxLength={100}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm font-medium">
              <span>Marca (opcional)</span>
              <input name="manufacturer" className={inputClass} maxLength={120} />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              <span>Modelo (opcional)</span>
              <input name="model" className={inputClass} maxLength={120} />
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="confirmed"
              required
              className="accent-primary size-4 shrink-0"
            />
            Confirmo que es un equipo físico y que no está registrado.
          </label>
          <Button type="submit" className="min-h-11" isDisabled={busy || !selected}>
            {busy ? 'Registrando…' : 'Registrar equipo'}
          </Button>
        </fieldset>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </form>
  )
}
