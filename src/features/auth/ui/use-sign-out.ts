import { toast } from '@doscientos/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { clearFieldEntryQueues } from '@/features/field-entries/application/field-entry-queue'
import { clearVisitIncidentQueues } from '@/features/incidents/application/incident-queue'
import { clearMeasurementQueues } from '@/features/measurements/application/measurement-queue'
import { clearPendingVisitPhotos } from '@/features/visits/application/visit-photo-queue'
import { clearVisitReportLocalDrafts } from '@/features/visits/application/visit-report-local-draft'

import { signOut } from '../application/auth-actions'

/** Signs out, wipes every cached query (another user must never see this data) and goes to /entrar. */
export function useSignOut() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return async () => {
    let photoClearFailed = false
    try {
      await clearPendingVisitPhotos()
    } catch {
      photoClearFailed = true
    }
    await signOut()
    clearVisitReportLocalDrafts()
    clearMeasurementQueues()
    clearFieldEntryQueues()
    clearVisitIncidentQueues()
    queryClient.clear()
    await navigate({ to: '/entrar' })
    if (photoClearFailed) {
      toast.error('No se pudieron borrar las fotos pendientes de este dispositivo.')
    }
  }
}
