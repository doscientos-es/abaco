import { Button } from '@doscientos/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { can, useSession } from '@/features/auth'
import { retryStoreSaves, useSaveStatus } from '@/shared/store/store'

import { ClientFormDialog } from './client-form-dialog'
import { CreatePassportItem } from './client-passport-dialog'

type RelatedKind = 'client' | 'location'

/** Create related records without leaving the current form. */
export function useRelatedRecordCreation({
  tenantId,
  clientId,
  onClientCreated,
  onLocationCreated,
}: {
  tenantId: string
  clientId: string
  onClientCreated?: (id: string) => void
  onLocationCreated: (id: string) => void
}) {
  const session = useSession()
  const queryClient = useQueryClient()
  const saveStatus = useSaveStatus()
  const [creating, setCreating] = useState<RelatedKind | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const storePending = saveStatus.state !== 'saved'
  const pending = storePending || refreshing || refreshFailed
  const allowed = can(session?.role, 'clients:write')

  async function refreshTargets() {
    setRefreshing(true)
    setRefreshFailed(false)
    try {
      await Promise.all(
        ['work-target-options', 'client-passport'].map((key) =>
          queryClient.invalidateQueries(
            { queryKey: [key, tenantId, clientId] },
            { throwOnError: true },
          ),
        ),
      )
    } catch {
      setRefreshFailed(true)
    } finally {
      setRefreshing(false)
    }
  }

  function start(kind: RelatedKind) {
    if (!allowed || (kind !== 'client' && (pending || !clientId))) return
    if (kind === 'client' && !onClientCreated) return
    setCreating(kind)
  }

  const status = pending ? (
    <output className="text-muted-foreground block space-y-1 text-sm sm:col-span-2">
      {saveStatus.state === 'error' ? (
        <>
          <p>No se pudieron guardar los cambios: {saveStatus.message}</p>
          <Button type="button" variant="outline" onPress={retryStoreSaves}>
            Reintentar guardado
          </Button>
        </>
      ) : refreshFailed ? (
        <>
          <p>No se pudieron actualizar los centros.</p>
          <Button type="button" variant="outline" onPress={() => void refreshTargets()}>
            Reintentar actualización
          </Button>
        </>
      ) : refreshing ? (
        <p>Actualizando centros…</p>
      ) : (
        <p>Esperando a que se guarden los cambios…</p>
      )}
    </output>
  ) : null

  const dialogs = (
    <>
      {onClientCreated ? (
        <ClientFormDialog
          open={creating === 'client'}
          onClose={() => setCreating(null)}
          onSaved={onClientCreated}
        />
      ) : null}
      {creating === 'location' ? (
        <CreatePassportItem
          item={{ kind: 'location' }}
          tenantId={tenantId}
          clientId={clientId}
          serviceLocationOnly
          onClose={() => setCreating(null)}
          onCreated={(id) => {
            if (id) onLocationCreated(id)
            setCreating(null)
            void refreshTargets()
          }}
          onError={() => {
            void queryClient.invalidateQueries({
              queryKey: ['work-target-options', tenantId, clientId],
            })
          }}
        />
      ) : null}
    </>
  )

  return { creating, start, allowed, pending, storePending, status, dialogs }
}

export function RelatedCreateButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="text-primary self-start text-xs font-medium hover:underline disabled:opacity-50"
      disabled={disabled}
      onClick={onPress}
    >
      + {label}
    </button>
  )
}
