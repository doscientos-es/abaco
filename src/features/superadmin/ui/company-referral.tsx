import { Button, Input } from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useSession } from '@/features/auth'
import { useActionLock } from '@/shared/lib/use-action-lock'

import {
  platformCompaniesQuery,
  platformCompanyReferralQuery,
  setCompanyReferral,
} from '../application/superadmin-queries'
import {
  PlatformFeedback,
  PlatformLoading,
  PlatformMessage,
  PlatformPagination,
} from './platform-ui'

export function CompanyReferralSection({ tenantId }: { tenantId: string }) {
  const client = useQueryClient()
  const userId = useSession()?.userId ?? ''
  const referral = useQuery(platformCompanyReferralQuery(tenantId))
  const [editing, setEditing] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null)
  const [expected, setExpected] = useState<string | null>(null)
  const saveLock = useActionLock()
  const companies = useQuery({
    ...platformCompaniesQuery(userId, search.trim(), (page - 1) * 50),
    enabled: Boolean(userId) && editing && search.trim().length > 0,
  })
  const save = useMutation({
    mutationFn: (expected: string | null) =>
      setCompanyReferral(tenantId, selected?.id ?? null, expected),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: platformCompanyReferralQuery(tenantId).queryKey }),
        client.invalidateQueries({ queryKey: ['referral-overview'] }),
      ])
      setEditing(false)
    },
    onSettled: () => {
      saveLock.release()
    },
  })

  return (
    <section
      aria-labelledby="company-referral-title"
      className="border-border bg-card space-y-3 rounded-lg border p-4"
    >
      <h2 id="company-referral-title" className="font-semibold">
        Recomendación
      </h2>
      {referral.isPending ? <PlatformLoading>Cargando recomendación…</PlatformLoading> : null}
      {referral.isError ? (
        <PlatformMessage
          title="No se pudo cargar la recomendación."
          onRetry={() => void referral.refetch()}
        />
      ) : null}
      {!referral.isPending && !referral.isError && !referral.data ? (
        <PlatformMessage title="No se ha encontrado la empresa." />
      ) : null}
      {referral.data && !referral.isError ? (
        <>
          <p className="text-sm">
            Recomendada por: <strong>{referral.data.referrer_name ?? 'Nadie'}</strong>
          </p>
          <p className="text-muted-foreground text-xs">
            Solo superadministración puede corregir esta asignación. Los cambios quedan registrados.
          </p>
          {!editing ? (
            <Button
              variant="outline"
              onPress={() => {
                setExpected(referral.data?.referrer_id ?? null)
                setSelected(
                  referral.data?.referrer_id
                    ? { id: referral.data.referrer_id, name: referral.data.referrer_name ?? '' }
                    : null,
                )
                setEditing(true)
                save.reset()
              }}
            >
              Modificar recomendación
            </Button>
          ) : (
            <div className="space-y-3">
              <label htmlFor="referrer-search" className="block text-sm">
                Buscar empresa que recomendó
              </label>
              <Input
                id="referrer-search"
                value={search}
                maxLength={120}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder="Nombre de la empresa"
              />
              {companies.isFetching ? <PlatformLoading>Buscando empresas…</PlatformLoading> : null}
              {companies.isError ? (
                <PlatformMessage
                  title="No se pudieron buscar empresas."
                  onRetry={() => void companies.refetch()}
                />
              ) : null}
              {search.trim() && !companies.isFetching && !companies.isError ? (
                <div className="space-y-2">
                  {!companies.data?.rows.length ? (
                    <p className="text-sm">No hay resultados.</p>
                  ) : null}
                  {companies.data?.rows
                    .filter((company) => company.id !== tenantId)
                    .map((company) => (
                      <div key={company.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <Button
                          size="sm"
                          variant="outline"
                          onPress={() => setSelected({ id: company.id, name: company.name })}
                        >
                          Seleccionar
                        </Button>
                        <span>
                          {company.name}{' '}
                          <span className="text-muted-foreground">({company.id})</span>
                        </span>
                      </div>
                    ))}
                  <PlatformPagination
                    page={page}
                    count={companies.data?.rows.length ?? 0}
                    hasMore={companies.data?.hasMore ?? false}
                    onChange={setPage}
                  />
                </div>
              ) : null}
              <p className="text-sm">
                Nueva asignación: <strong>{selected?.name ?? 'Nadie'}</strong>
              </p>
              {selected ? (
                <Button variant="outline" onPress={() => setSelected(null)}>
                  Quitar asignación
                </Button>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  isDisabled={save.isPending || (selected?.id ?? null) === expected}
                  onPress={() => {
                    if (!saveLock.acquire()) return
                    save.mutate(expected)
                  }}
                >
                  {save.isPending ? 'Guardando…' : 'Guardar asignación'}
                </Button>
                <Button
                  variant="outline"
                  isDisabled={save.isPending}
                  onPress={() => {
                    setEditing(false)
                    save.reset()
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
          <PlatformFeedback action={save} success="Recomendación actualizada." />
        </>
      ) : null}
    </section>
  )
}
