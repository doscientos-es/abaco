export const equipmentScanPath = '/equipo-qr'

const opaqueTag = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function tagFromFragment(fragment: string) {
  const token = fragment.replace(/^#/, '')
  return opaqueTag.test(token) ? token.toLowerCase() : null
}

export function equipmentScanUrl(origin: string, token: string) {
  if (!opaqueTag.test(token)) return null
  return new URL(`${equipmentScanPath}#${token.toLowerCase()}`, origin).href
}

export type LabelAction = 'issue' | 'rotate' | 'revoke'
export type LabelOption = {
  equipment_id: string
  kind: string
  manufacturer: string
  model: string
  revision: number
  token: string | null
}
export type EquipmentActivity = { type: 'equipment' | 'incident'; date: string; status: string }
export type ScannedEquipment = Omit<LabelOption, 'equipment_id' | 'revision' | 'token'> & {
  activity: EquipmentActivity[]
}

const activityStatuses = {
  equipment: {
    active: 'Equipo activo',
    replaced: 'Equipo sustituido',
    retired: 'Equipo retirado',
    transferred: 'Equipo trasladado',
  },
  incident: {
    open: 'Incidencia abierta',
    in_progress: 'Incidencia en curso',
    resolved: 'Incidencia resuelta',
    reopened: 'Incidencia reabierta',
    canceled: 'Incidencia cancelada',
  },
}

export function equipmentActivityLabel(activity: EquipmentActivity) {
  const labels: Readonly<Record<string, string>> = activityStatuses[activity.type] ?? {}
  return Object.hasOwn(labels, activity.status) ? labels[activity.status] : null
}

export function equipmentSubtitle(piece: { manufacturer: string; model: string }) {
  return [piece.manufacturer.trim(), piece.model.trim()].filter(Boolean).join(' · ')
}
