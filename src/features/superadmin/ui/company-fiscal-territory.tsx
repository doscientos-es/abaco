import { Button } from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  setSubscriptionTaxTerritory,
  subscriptionTaxQuery,
  subscriptionTerritories,
  type SubscriptionTerritory,
} from '@/features/billing'

import { PlatformField, PlatformSelect } from './platform-form-field'
import { PlatformFeedback, PlatformLoading, PlatformMessage } from './platform-ui'

const options = [
  { id: 'auto', label: 'Automático · código postal' },
  ...Object.entries(subscriptionTerritories).map(([id, label]) => ({ id, label })),
]
export function CompanyFiscalTerritory({
  tenantId,
  blocked,
}: {
  tenantId: string
  blocked: boolean
}) {
  const query = subscriptionTaxQuery(tenantId)
  const fiscal = useQuery(query)
  const cache = useQueryClient()
  const [draft, setDraft] = useState<string>()
  const save = useMutation({
    mutationFn: (territory: SubscriptionTerritory | null) =>
      setSubscriptionTaxTerritory(tenantId, territory),
    onSuccess: async () => {
      await cache.invalidateQueries(query)
      setDraft(undefined)
    },
  })

  if (fiscal.isError)
    return (
      <PlatformMessage
        title="No se pudo comprobar el territorio fiscal."
        onRetry={() => void fiscal.refetch()}
      />
    )
  if (!fiscal.data) return <PlatformLoading>Cargando territorio fiscal…</PlatformLoading>
  const tax = fiscal.data
  const saved = tax.override ?? 'auto'
  const selected = draft ?? saved
  const canSave = !blocked && !save.isPending && tax.detected !== 'review' && selected !== saved

  return (
    <form
      aria-label="Territorio fiscal de la suscripción"
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSave) save.mutate(selected === 'auto' ? null : (selected as SubscriptionTerritory))
      }}
    >
      <div className="space-y-1 text-sm">
        <h4 className="font-semibold">Territorio fiscal de la suscripción</h4>
        <p>
          Detectado por código postal: <strong>{subscriptionTerritories[tax.detected]}</strong>.
        </p>
        <p className="text-muted-foreground">
          {tax.status === 'ready'
            ? 'Puede usar el circuito de IVA general.'
            : tax.status === 'outside_iva'
              ? 'Fuera del IVA peninsular. El circuito actual no puede emitir esta suscripción.'
              : 'Pendiente de revisión fiscal. No se permiten cobros con los datos actuales.'}
        </p>
      </div>
      <PlatformField
        label="Territorio fiscal"
        hint="Si no coincide con la dirección, no se cobrará. Corrige primero la dirección fiscal guardada, si procede."
      >
        {(control) => (
          <PlatformSelect
            {...control}
            value={selected}
            options={options}
            isDisabled={blocked || save.isPending || tax.detected === 'review'}
            onChange={(value) => {
              if (value) {
                setDraft(value)
                save.reset()
              }
            }}
          />
        )}
      </PlatformField>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" isDisabled={!canSave}>
          Guardar territorio
        </Button>
        <PlatformFeedback action={save} success="Territorio actualizado para futuros cobros." />
      </div>
    </form>
  )
}
