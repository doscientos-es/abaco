import { Button } from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  billingProfileFields,
  billingProfileQuery,
  saveBillingProfile,
} from '../application/subscription-billing-profile'
import { subscriptionTaxQuery } from '../application/subscription-tax'

export function SubscriptionBillingProfileForm({
  tenantId,
  onChange,
  onSaved,
}: {
  tenantId: string
  onChange?: () => void
  onSaved?: () => void
}) {
  const profile = useQuery(billingProfileQuery(tenantId))
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (form: FormData) => saveBillingProfile(tenantId, form),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries(billingProfileQuery(tenantId)),
        queryClient.invalidateQueries(subscriptionTaxQuery(tenantId)),
      ])
      onSaved?.()
    },
  })

  return (
    <details className="border-border space-y-3 rounded-lg border p-4" open={!profile.data}>
      <summary className="cursor-pointer text-sm font-semibold">
        Datos fiscales de la suscripción
      </summary>
      <p className="text-muted-foreground text-xs">
        Indica la dirección fiscal del negocio o establecimiento que recibe la suscripción.
        Detectaremos el territorio mediante el código postal. No cambia las facturas que emites a
        tus clientes.
      </p>
      {profile.isPending ? <output className="block">Cargando datos fiscales…</output> : null}
      {profile.isError ? (
        <Button variant="outline" onPress={() => void profile.refetch()}>
          Reintentar carga
        </Button>
      ) : null}
      {profile.isSuccess ? (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onChange={onChange}
          onSubmit={(event) => {
            event.preventDefault()
            onChange?.()
            save.mutate(new FormData(event.currentTarget))
          }}
        >
          {billingProfileFields.map((field) => (
            <label key={field.name} className="grid gap-1 text-sm">
              {field.label}
              <input
                className="border-input bg-background rounded-md border px-2 py-1.5"
                name={field.name}
                type={field.name === 'email' ? 'email' : 'text'}
                pattern={'pattern' in field ? field.pattern : undefined}
                defaultValue={profile.data?.[field.name]}
                maxLength={field.length}
                required
              />
            </label>
          ))}
          <div className="space-y-2 sm:col-span-2">
            <Button type="submit" isDisabled={save.isPending}>
              {save.isPending ? 'Guardando…' : 'Guardar datos fiscales'}
            </Button>
            {save.isError ? <p role="alert">{save.error.message}</p> : null}
            {save.isSuccess ? <output className="block">Datos fiscales guardados.</output> : null}
          </div>
        </form>
      ) : null}
    </details>
  )
}
