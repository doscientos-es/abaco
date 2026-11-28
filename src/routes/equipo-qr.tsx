import { createFileRoute, useRouterState } from '@tanstack/react-router'

import { ScannedEquipmentPage } from '@/features/equipment-labels/ui/scanned-equipment-page'

export const Route = createFileRoute('/equipo-qr')({ component: EquipmentScanRoute })

function EquipmentScanRoute() {
  const fragment = useRouterState({ select: (state) => state.location.hash })
  return <ScannedEquipmentPage fragment={fragment} />
}
