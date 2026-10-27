import { Button } from '@doscientos/ui'

import { PoolMeasurementsPanel } from '@/features/measurements/ui/pool-measurements-panel'
import { SelectField } from '@/shared/ui/form'

import type { ClientPassport } from '../application/client-passport-actions'

const assetStatuses: Record<ClientPassport['assets'][number]['status'], string> = {
  active: 'Activa',
  out_of_season: 'Fuera de temporada',
  inactive: 'Inactiva',
  retired: 'Dada de baja',
}
const assetStatusOptions = Object.entries(assetStatuses).map(([value, label]) => ({ value, label }))
const poolUses: Record<ClientPassport['pools'][number]['use_kind'], string> = {
  private: 'Privada',
  community: 'Comunitaria',
  public: 'Pública',
  other: 'Otro uso',
}
const poolKinds: Record<ClientPassport['pools'][number]['pool_kind'], string> = {
  outdoor: 'Exterior',
  indoor: 'Interior',
  spa: 'Spa',
  other: 'Otra',
}
const equipmentStatuses: Record<ClientPassport['equipment'][number]['status'], string> = {
  active: 'Activo',
  replaced: 'Sustituido',
  transferred: 'Trasladado',
  retired: 'Dado de baja',
}

export function AssetCard({
  tenantId,
  asset,
  data,
  canWrite,
  changing,
  onAssetStatus,
  onEquipmentStatus,
  onEditPool,
  onEditEquipment,
  onReplaceEquipment,
  onTransferEquipment,
  onAddEquipment,
}: {
  tenantId: string
  asset: ClientPassport['assets'][number]
  data: ClientPassport
  canWrite: boolean
  changing: string | null
  onAssetStatus: (status: ClientPassport['assets'][number]['status']) => void
  onEquipmentStatus: (
    equipment: ClientPassport['equipment'][number],
    status: 'active' | 'retired',
  ) => void
  onEditPool: (profile: ClientPassport['pools'][number]) => void
  onEditEquipment: (equipment: ClientPassport['equipment'][number]) => void
  onReplaceEquipment: (equipment: ClientPassport['equipment'][number]) => void
  onTransferEquipment: (equipment: ClientPassport['equipment'][number]) => void
  onAddEquipment: () => void
}) {
  const pool = data.pools.find((profile) => profile.asset_id === asset.id)
  const equipment = data.equipment.filter((item) => item.asset_id === asset.id)
  const history = [
    ...data.assetHistory.filter((event) => event.asset_id === asset.id),
    ...data.equipmentHistory.filter((event) => event.asset_id === asset.id),
  ].sort((a, b) => b.changed_at.localeCompare(a.changed_at))
  return (
    <div className="border-border rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{asset.name}</h3>
          <p className="text-muted-foreground text-sm">
            {asset.kind === 'pool' ? 'Piscina' : 'Activo'} · {assetStatuses[asset.status]}
            {pool?.volume_m3 ? ` · ${pool.volume_m3} m³` : ''}
            {pool?.treatment ? ` · ${pool.treatment}` : ''}
          </p>
          {pool ? (
            <p className="text-muted-foreground text-sm">
              {poolUses[pool.use_kind]} · {poolKinds[pool.pool_kind]}
              {pool.length_m && pool.width_m ? ` · ${pool.length_m} × ${pool.width_m} m` : ''}
              {pool.average_depth_m ? ` · profundidad media ${pool.average_depth_m} m` : ''}
              {pool.lining ? ` · ${pool.lining}` : ''}
            </p>
          ) : null}
          {pool?.season_notes ? (
            <p className="text-muted-foreground text-sm">Temporada: {pool.season_notes}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {canWrite ? (
            <div className="min-w-40">
              <SelectField
                label="Estado del activo"
                value={asset.status}
                options={assetStatusOptions}
                onChange={(status) =>
                  onAssetStatus(status as ClientPassport['assets'][number]['status'])
                }
              />
            </div>
          ) : null}
          {canWrite && asset.status !== 'retired' ? (
            <Button size="sm" variant="outline" onPress={onAddEquipment}>
              Añadir equipo
            </Button>
          ) : null}
          {canWrite && pool && asset.status !== 'retired' ? (
            <Button size="sm" variant="ghost" onPress={() => onEditPool(pool)}>
              Editar piscina
            </Button>
          ) : null}
        </div>
      </div>
      {equipment.length ? (
        <ul className="mt-3 space-y-2 text-sm">
          {equipment.map((item) => (
            <li
              key={item.id}
              className="bg-surface-subtle flex flex-wrap items-center justify-between gap-2 rounded-md p-2"
            >
              <span>
                <span className="font-medium">{item.kind}</span>
                {item.manufacturer || item.model ? ` · ${item.manufacturer} ${item.model}` : ''}
                {item.serial_number ? ` · Nº ${item.serial_number}` : ''}
                {item.supplier ? ` · Proveedor: ${item.supplier}` : ''}
                {item.installed_at ? ` · Instalado: ${item.installed_at}` : ''}
                {item.warranty_ends_at ? ` · Garantía hasta ${item.warranty_ends_at}` : ''}
                {item.status !== 'active' ? ` · ${equipmentStatuses[item.status]}` : ''}
                {item.replaces_equipment_id
                  ? ` · Sustituye a ${data.equipment.find((previous) => previous.id === item.replaces_equipment_id)?.kind ?? 'equipo anterior'}`
                  : ''}
                {item.specifications ? ` · ${item.specifications}` : ''}
                {item.notes ? ` · ${item.notes}` : ''}
              </span>
              {canWrite && (item.status === 'active' || item.status === 'retired') ? (
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" onPress={() => onEditEquipment(item)}>
                    Editar
                  </Button>
                  {item.status === 'active' &&
                  (asset.status === 'active' || asset.status === 'out_of_season') ? (
                    <Button size="sm" variant="ghost" onPress={() => onReplaceEquipment(item)}>
                      Sustituir
                    </Button>
                  ) : null}
                  {item.status === 'active' &&
                  data.assets.some(
                    (candidate) =>
                      candidate.id !== item.asset_id &&
                      (candidate.status === 'active' || candidate.status === 'out_of_season') &&
                      data.locations.some(
                        (location) => location.id === candidate.location_id && location.active,
                      ),
                  ) ? (
                    <Button size="sm" variant="ghost" onPress={() => onTransferEquipment(item)}>
                      Trasladar
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    isDisabled={changing === item.id}
                    onPress={() =>
                      onEquipmentStatus(item, item.status === 'active' ? 'retired' : 'active')
                    }
                  >
                    {item.status === 'active' ? 'Dar de baja' : 'Reactivar'}
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-3 text-sm">Sin equipos instalados.</p>
      )}
      {pool ? (
        <PoolMeasurementsPanel tenantId={tenantId} assetId={asset.id} canWrite={canWrite} />
      ) : null}
      {history.length ? (
        <details className="mt-3 text-sm">
          <summary className="text-primary cursor-pointer font-medium">Historial reciente</summary>
          <ol className="border-border mt-2 space-y-2 border-l pl-4">
            {history.map((event) => (
              <li key={event.id}>
                <time className="text-muted-foreground" dateTime={event.changed_at}>
                  {new Date(event.changed_at).toLocaleString('es-ES', {
                    timeZone: 'Europe/Madrid',
                  })}
                </time>{' '}
                · {historyDescription(event)}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  )
}

function historyDescription(
  event: ClientPassport['assetHistory'][number] | ClientPassport['equipmentHistory'][number],
) {
  const isEquipment = 'equipment_id' in event
  if (!isEquipment && event.source === 'pool_profile') {
    return event.before_state ? 'Ficha de piscina actualizada' : 'Ficha de piscina registrada'
  }
  const entity = isEquipment ? 'Equipo' : 'Activo'
  if (!event.before_state) return `${entity} registrado`
  if (event.before_state.status !== event.after_state.status) {
    const labels: Record<string, string> = isEquipment ? equipmentStatuses : assetStatuses
    const before = String(event.before_state.status)
    const after = String(event.after_state.status)
    return `${entity}: ${labels[before] ?? before} → ${labels[after] ?? after}`
  }
  if (
    event.before_state.asset_id !== event.after_state.asset_id ||
    event.before_state.location_id !== event.after_state.location_id
  ) {
    return `${entity} trasladado`
  }
  return `${entity} actualizado`
}
