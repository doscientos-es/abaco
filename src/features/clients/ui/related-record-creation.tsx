import { Button } from '@doscientos/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { can, useSession } from '@/features/auth'
import { retryStoreSaves, useSaveStatus } from '@/shared/store/store'

import { ClientFormDialog } from './client-form-dialog'
import { CreatePassportItem } from './client-passport-dialog'

type RelatedKind = 'client' | 'location' | 'pool'

/** Create related records without leaving the current form. */
export function useRelatedRecordCreation({
  tenantId,
  clientId,
  locationId,
  onClientCreated,
  onLocationCreated,
  onPoolCreated,
}: {
  tenantId: string
  clientId: string
  locationId: string
  onClientCreated: (id: string) => void
  onLocationCreated: (id: string) => void
  onPoolCreated: (id: string) => void
}) {
  const session = useSession()
  const queryClient = useQueryClient()
  const saveStatus = useSaveStatus()
  const [creating, setCreating] = useState<RelatedKind | null>(null)
  const pending = saveStatus.state !== 'saved'
  const allowed = can(session?.role, 'clients:write')

  function start(kind: RelatedKind) {
    if (!allowed || (kind !== 'client' && (pending || !clientId))) return
    if (kind === 'pool' && !locationId) return
    setCreating(kind)
  }

  const status = pending ? (
    <div className="text-muted-foreground space-y-1 text-sm sm:col-span-2" role="status">
      {saveStatus.state === 'error' ? (
        <>
          <p>No se pudieron guardar los cambios: {saveStatus.message}</p>
          <Button type="button" variant="outline" onPress={retryStoreSaves}>
            Reintentar guardado
          </Button>
        </>
      ) : (
        <p>Esperando a que se guarden los cambios…</p>
      )}
    </div>
  ) : null

  const dialogs = (
    <>
      <ClientFormDialog
        open={creating === 'client'}
        onClose={() => setCreating(null)}
        onSaved={onClientCreated}
      />
      {creating === 'location' || creating === 'pool' ? (
        <CreatePassportItem
          item={creating === 'location' ? { kind: 'location' } : { kind: 'pool', locationId }}
          tenantId={tenantId}
          clientId={clientId}
          serviceLocationOnly
          onClose={() => setCreating(null)}
          onCreated={(id) => {
            if (id) {
              if (creating === 'location') onLocationCreated(id)
              else onPoolCreated(id)
            }
            setCreating(null)
            void queryClient.invalidateQueries({
              queryKey: ['work-target-options', tenantId, clientId],
            })
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

  return { creating, start, allowed, pending, status, dialogs }
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
