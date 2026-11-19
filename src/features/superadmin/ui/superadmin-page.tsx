import { useQuery } from '@tanstack/react-query'

import { useSession } from '@/features/auth'

import {
  platformAccessQuery,
  platformCompaniesQuery,
  platformCompanyQuery,
} from '../application/superadmin-queries'
import { platformPageSize, type PlatformSearch } from '../domain/platform-navigation'
import { CompanyBackLink, CompanyDetail } from './company-detail'
import { CompanyDirectory } from './company-directory'
import { PlatformCatalog } from './platform-catalog'
import { PlatformInvoices } from './platform-invoices'
import { PlatformShell } from './platform-shell'
import { PlatformMessage } from './platform-ui'

export function SuperadminPage({ search }: { search: PlatformSearch }) {
  const session = useSession()
  const access = useQuery(platformAccessQuery(session?.userId ?? ''))

  if (!access.data || access.isError) {
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        {access.isPending ? (
          <output>Comprobando acceso…</output>
        ) : access.isError ? (
          <PlatformMessage
            title="No se pudo comprobar el acceso."
            onRetry={() => void access.refetch()}
          />
        ) : (
          <p role="alert">No tienes acceso al panel de plataforma.</p>
        )}
      </main>
    )
  }

  return (
    <PlatformShell session={session} search={search}>
      {search.vista === 'planes' ? (
        <PlatformCatalog search={search} />
      ) : search.vista === 'facturas' && session ? (
        <PlatformInvoices search={search} userId={session.userId} />
      ) : search.empresa ? (
        <CompanyPage search={search} tenantId={search.empresa} />
      ) : (
        <DirectoryPage search={search} />
      )}
    </PlatformShell>
  )
}

function DirectoryPage({ search }: { search: PlatformSearch }) {
  const offset = ((search.page ?? 1) - 1) * platformPageSize
  const companies = useQuery(platformCompaniesQuery(search.q ?? '', offset))

  return (
    <CompanyDirectory
      companies={companies.data ?? []}
      search={search}
      loading={companies.isPending}
      onRetry={companies.isError ? () => void companies.refetch() : undefined}
    />
  )
}

function CompanyPage({ search, tenantId }: { search: PlatformSearch; tenantId: string }) {
  const company = useQuery(platformCompanyQuery(tenantId))

  if (company.data && !company.isError) {
    return <CompanyDetail key={tenantId} company={company.data} search={search} />
  }

  return (
    <div className="space-y-4">
      <CompanyBackLink search={search} />
      {company.isPending ? (
        <output>Cargando empresa…</output>
      ) : company.isError ? (
        <PlatformMessage
          title="No se pudo cargar la empresa."
          onRetry={() => void company.refetch()}
        />
      ) : (
        <PlatformMessage title="No se ha encontrado la empresa.">
          Vuelve al listado para elegir otra.
        </PlatformMessage>
      )}
    </div>
  )
}
