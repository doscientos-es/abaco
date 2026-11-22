import { Button, Input } from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { platformIssuerQuery, savePlatformIssuer } from '../application/platform-issuer'
import {
  emptyIssuer,
  issuerErrors,
  normalizeIssuer,
  type IssuerProfile,
  type IssuerSettings,
} from '../domain/platform-issuer'
import { PlatformField } from './platform-form-field'
import {
  PlatformFeedback,
  PlatformLoading,
  PlatformMessage,
  platformPanelClass,
} from './platform-ui'

const fields = [
  { key: 'legal_name', label: 'Razón social', maxLength: 160 },
  { key: 'tax_id', label: 'NIF', maxLength: 9 },
  { key: 'street', label: 'Dirección fiscal', maxLength: 250 },
  { key: 'postal_code', label: 'Código postal', maxLength: 5 },
  { key: 'city', label: 'Municipio', maxLength: 120 },
  { key: 'province', label: 'Provincia', maxLength: 120 },
  { key: 'series', label: 'Serie ordinaria', maxLength: 20 },
  { key: 'corrective_series', label: 'Serie rectificativa', maxLength: 20 },
] as const

export function PlatformIssuer({ userId }: { userId: string }) {
  const settings = useQuery(platformIssuerQuery(userId))
  return (
    <details className={`${platformPanelClass} p-4`}>
      <summary className="cursor-pointer font-semibold">Datos fiscales de Doscientos</summary>
      <p className="text-muted-foreground mt-2 text-sm">
        Estos datos preparan la futura emisión desde Ábaco. Guardarlos no la activa ni modifica
        Backoffice.
      </p>
      {settings.isPending ? <PlatformLoading>Cargando datos fiscales…</PlatformLoading> : null}
      {settings.isError ? (
        <PlatformMessage
          title="No se pudieron cargar los datos fiscales."
          onRetry={() => void settings.refetch()}
        />
      ) : null}
      {settings.data && !settings.isError ? (
        <IssuerForm key={settings.data.revision} settings={settings.data} userId={userId} />
      ) : null}
    </details>
  )
}

function IssuerForm({ settings, userId }: { settings: IssuerSettings; userId: string }) {
  const [values, setValues] = useState<IssuerProfile>(() => settings.profile ?? emptyIssuer())
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (profile: IssuerProfile) => savePlatformIssuer(settings.revision, profile),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: platformIssuerQuery(userId).queryKey }),
  })
  const errors = issuerErrors(values)
  const disabled = mutation.isPending
  return (
    <form
      className="mt-4 space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (!disabled && Object.keys(errors).length === 0) mutation.mutate(normalizeIssuer(values))
      }}
    >
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <PlatformField key={field.key} label={field.label} error={errors[field.key]}>
            {(control) => (
              <Input
                {...control}
                required
                maxLength={field.maxLength}
                value={values[field.key]}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  if (mutation.isError) mutation.reset()
                  setValues((current) => ({ ...current, [field.key]: value }))
                }}
              />
            )}
          </PlatformField>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" isDisabled={disabled || Object.keys(errors).length > 0}>
          Guardar datos fiscales
        </Button>
        <PlatformFeedback action={mutation} success="Datos fiscales guardados." />
      </div>
    </form>
  )
}
