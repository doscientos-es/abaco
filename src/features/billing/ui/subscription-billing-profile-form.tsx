import { Button } from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  billingProfileFields,
  billingProfileQuery,
  saveBillingProfile,
} from '../application/subscription-billing-profile'

export function SubscriptionBillingProfileForm({ tenantId }: { tenantId: string }) {
  const profile = useQuery(billingProfileQuery(tenantId))
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (form: FormData) => saveBillingProfile(tenantId, form),
    onSuccess: () => queryClient.invalidateQueries(billingProfileQuery(tenantId)),
  })

  return (
    <details className="border-border space-y-3 rounded-lg border p-4" open={!profile.data}>
      <summary className="cursor-pointer text-sm font-semibold">
        Datos fiscales de la suscripción
      </summary>
      <p className="text-muted-foreground text-xs">
        Doscientos usará estos datos para enviarte las facturas de Ábaco. No cambian las facturas
        que emites a tus clientes. Por ahora solo se admite facturación en España con IVA del 21 %.
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
          onSubmit={(event) => {
            event.preventDefault()
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
