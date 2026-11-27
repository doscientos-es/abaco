import { Button, Input } from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  platformCompanyProfileQuery,
  updateCompanyProfile,
} from '../application/superadmin-queries'
import {
  companyProfileErrors,
  companyProfileFields,
  normalizedCompanyProfile,
  type CompanyProfile,
  type CompanyProfileValues,
} from '../domain/company-profile'
import {
  companySectionSearch,
  withoutEditor,
  type PlatformSearch,
} from '../domain/platform-navigation'
import { PlatformField } from './platform-form-field'
import {
  PlatformBackLink,
  PlatformEditLink,
  PlatformFeedback,
  PlatformLoading,
  PlatformMessage,
} from './platform-ui'

const fields = [
  { key: 'name', label: 'Nombre comercial', placeholder: 'Nombre de la empresa', maxLength: 120 },
  { key: 'legal_name', label: 'Razón social', placeholder: 'Nombre legal', maxLength: 160 },
  { key: 'tax_id', label: 'NIF / CIF', placeholder: 'B12345678', maxLength: 32 },
  {
    key: 'email',
    label: 'Correo de contacto',
    placeholder: 'hola@empresa.es',
    type: 'email',
    maxLength: 254,
  },
  { key: 'phone', label: 'Teléfono', placeholder: '600 000 000', type: 'tel', maxLength: 32 },
  {
    key: 'website',
    label: 'Página web',
    placeholder: 'https://empresa.es',
    type: 'url',
    maxLength: 2048,
  },
  { key: 'address', label: 'Dirección', placeholder: 'Calle y número', maxLength: 300 },
  { key: 'postal_code', label: 'Código postal', placeholder: '08001', maxLength: 20 },
  { key: 'city', label: 'Ciudad', placeholder: 'Barcelona', maxLength: 100 },
] as const

export function CompanyProfileSection({
  tenantId,
  search,
}: {
  tenantId: string
  search: PlatformSearch
}) {
  const profile = useQuery(platformCompanyProfileQuery(tenantId))
  const data = profile.data
  return (
    <section aria-labelledby="company-profile-title" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="company-profile-title" className="text-base font-semibold">
            Datos de la empresa
          </h2>
          <p className="text-muted-foreground text-sm">
            Identidad y contacto que la empresa utiliza en Menos Líos.
          </p>
        </div>
        {profile.data && search.edicion !== 'empresa' ? (
          <PlatformEditLink search={{ ...search, edicion: 'empresa' }}>
            Editar datos
          </PlatformEditLink>
        ) : null}
      </div>
      {profile.isPending ? <PlatformLoading>Cargando datos de la empresa…</PlatformLoading> : null}
      {profile.isError ? (
        <PlatformMessage
          title="No se pudieron cargar los datos de la empresa."
          onRetry={() => void profile.refetch()}
        />
      ) : null}
      {!profile.isPending && !profile.isError && !profile.data ? (
        <PlatformMessage title="No se ha encontrado la empresa." />
      ) : null}
      {data && !profile.isError ? (
        search.edicion === 'empresa' ? (
          <CompanyProfileForm key={tenantId} tenantId={tenantId} profile={data} search={search} />
        ) : (
          <div className="border-border bg-card rounded-lg border p-4 sm:p-5">
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map(({ key, label }) => (
                <div key={key} className="min-w-0 text-sm">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="mt-1 font-medium break-words">{data[key] || 'Sin indicar'}</dd>
                </div>
              ))}
            </dl>
            <p className="text-muted-foreground border-border mt-5 border-t pt-4 text-xs">
              Estos datos no modifican el perfil de facturación de la suscripción de Menos Líos.
            </p>
            <div className="mt-3">
              <PlatformBackLink search={companySectionSearch(search, 'suscripcion')}>
                Ir a suscripción y precio
              </PlatformBackLink>
            </div>
          </div>
        )
      ) : null}
    </section>
  )
}

function CompanyProfileForm({
  tenantId,
  profile,
  search,
}: {
  tenantId: string
  profile: CompanyProfile
  search: PlatformSearch
}) {
  const [values, setValues] = useState<CompanyProfileValues>(() =>
    normalizedCompanyProfile(profile),
  )
  const [revision] = useState(profile.updated_at)
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (next: CompanyProfileValues) => updateCompanyProfile(tenantId, revision, next),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: platformCompanyProfileQuery(tenantId).queryKey }),
        queryClient.invalidateQueries({ queryKey: ['platform-company', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['platform-companies'] }),
      ]),
  })
  const normalized = normalizedCompanyProfile(values)
  const original = normalizedCompanyProfile(profile)
  const dirty = companyProfileFields.some((key) => normalized[key] !== original[key])
  const errors = companyProfileErrors(values)
  const disabled = mutation.isPending || mutation.isSuccess
  return (
    <form
      className="border-border bg-card space-y-4 rounded-lg border p-4 sm:p-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (dirty && !disabled && Object.keys(errors).length === 0) mutation.mutate(normalized)
      }}
    >
      <PlatformBackLink search={withoutEditor(search)}>Volver a los datos</PlatformBackLink>
      <p className="text-muted-foreground text-sm">
        Solo el nombre comercial es obligatorio. Estos datos pueden aparecer en los documentos de la
        empresa; no cambian su factura de suscripción.
      </p>
      <fieldset disabled={disabled} className="grid min-w-0 gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <PlatformField key={field.key} label={field.label} error={errors[field.key]}>
            {(control) => (
              <Input
                {...control}
                type={'type' in field ? field.type : 'text'}
                required={field.key === 'name'}
                maxLength={field.maxLength}
                placeholder={field.placeholder}
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
      <div className="border-border flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="submit" isDisabled={!dirty || disabled || Object.keys(errors).length > 0}>
          Guardar datos
        </Button>
        <PlatformFeedback
          action={mutation}
          success="Datos guardados. Vuelve a la ficha para continuar."
        />
      </div>
    </form>
  )
}
