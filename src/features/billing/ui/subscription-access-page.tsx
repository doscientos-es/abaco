import { Button } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'

import { useCompanyActions, useSession, useSignOut } from '@/features/auth'

import { subscriptionQuery, tenantAccessQuery } from '../application/billing-actions'
import { BillingSection } from './billing-section'

/** Keeps subscription checkout available without loading the business workspace. */
export function SubscriptionAccessPage() {
  const session = useSession()
  const { switchTo } = useCompanyActions()
  const signOut = useSignOut()
  const router = useRouter()
  const search = useRouterState({ select: (state) => state.location.search })
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const tenantId = session?.tenantId ?? ''
  const subscription = useQuery({
    ...subscriptionQuery(tenantId),
    enabled: Boolean(tenantId && session?.role === 'admin'),
  })
  if (!session || !tenantId) return null
  const companyName =
    session.companies.find((company) => company.id === tenantId)?.name ?? 'Empresa'

  async function enter() {
    await queryClient.invalidateQueries({ queryKey: tenantAccessQuery(tenantId).queryKey })
    await router.invalidate()
    await router.navigate({ to: '/' })
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Activa tu suscripción</h1>
        <p>Para utilizar {companyName}, un administrador debe activar un plan.</p>
      </header>
      {session.role === 'admin' ? (
        <>
          {subscription.data?.canWrite ? (
            <Button onPress={() => void enter()}>Entrar en Ábaco</Button>
          ) : null}
          <BillingSection
            tenantId={tenantId}
            companyName={companyName}
            referralView={search.tab === 'plan' && search.seccion === 'referidos'}
          />
        </>
      ) : (
        <p>Pide a un administrador de la empresa que active la suscripción.</p>
      )}
      {session.companies.length > 1 ? (
        <div className="space-y-2">
          <p className="font-medium">Cambiar de empresa</p>
          {session.companies
            .filter((company) => company.id !== tenantId)
            .map((company) => (
              <Button
                key={company.id}
                variant="outline"
                onPress={() => {
                  void switchTo(company.id).catch(() => setError('No se pudo cambiar de empresa.'))
                }}
              >
                {company.name}
              </Button>
            ))}
        </div>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <div className="flex gap-4">
        <Link className="underline" to="/superadmin">
          Administración de plataforma
        </Link>
        <Button variant="outline" onPress={() => void signOut()}>
          Cerrar sesión
        </Button>
      </div>
    </main>
  )
}
