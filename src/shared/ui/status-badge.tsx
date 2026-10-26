import { Badge } from '@doscientos/ui'

import type { EstimateStatus } from '../domain/types'

const config: Record<
  EstimateStatus,
  { label: string; variant: 'neutral' | 'info' | 'success' | 'danger' }
> = {
  draft: { label: 'Borrador', variant: 'neutral' },
  sent: { label: 'Publicado', variant: 'info' },
  accepted: { label: 'Aceptado', variant: 'success' },
  rejected: { label: 'Rechazado', variant: 'danger' },
}

export function StatusBadge({ status }: { status: EstimateStatus }) {
  const { label, variant } = config[status]
  return <Badge variant={variant}>{label}</Badge>
}

export const statusLabels = Object.fromEntries(
  Object.entries(config).map(([key, value]) => [key, value.label]),
) as Record<EstimateStatus, string>
