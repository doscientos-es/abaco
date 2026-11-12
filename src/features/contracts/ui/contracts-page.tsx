import { Button, Card, CardContent, Tabs, TabsContent, TabsList, TabsTrigger } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { contractBillingLabels } from '@/shared/domain/contract-billing'
import { formatEuros } from '@/shared/domain/money'
import { useTenantData } from '@/shared/store/store'
import { fieldIcons } from '@/shared/ui/field-icons'
import { EmptyPanel } from '@/shared/ui/page-states'

import { listServiceContracts } from '../application/contract-actions'
import { contractStatusLabels as statusLabels } from '../domain/contract-status'
import { ContractJobsPage } from './contract-jobs-page'

export function ContractsPage() {
  const { tab } = useSearch({ from: '/contratos/' })
  const navigate = useNavigate({ from: '/contratos/' })
  const selected = tab === 'trabajos' ? 'trabajos' : 'contratos'
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Contratos de servicio</h1>
        <p className="text-muted-foreground text-sm">
          Cada contrato contiene sus trabajos. La planificación reúne las visitas de todos los
          contratos y las independientes.
        </p>
      </div>
      <Link to="/trabajos" className="text-primary text-sm underline">
        Ir a planificación
      </Link>
      <Tabs
        selectedKey={selected}
        onSelectionChange={(key) =>
          void navigate({
            to: '/contratos',
            search: key === 'trabajos' ? { tab: 'trabajos' } : {},
          })
        }
      >
        <TabsList aria-label="Secciones de contratos" className="w-full overflow-x-auto sm:w-fit">
          <TabsTrigger id="contratos">Contratos</TabsTrigger>
          <TabsTrigger id="trabajos">Trabajos contratados</TabsTrigger>
        </TabsList>
        <TabsContent id={selected} key={selected}>
          {selected === 'contratos' ? <ContractsList /> : <ContractJobsPage />}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ContractsList() {
  const { tenant, clients } = useTenantData()
  const [page, setPage] = useState(0)
  const query = useQuery({
    queryKey: ['service-contracts', tenant.id, page],
    queryFn: () => listServiceContracts(tenant.id, page),
  })
  return (
    <div className="space-y-6">
      <Link to="/presupuestos" className="text-primary text-sm underline">
        Crear o revisar presupuesto
      </Link>
      {query.isPending ? <output>Cargando contratos…</output> : null}
      {query.isError ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudieron cargar los contratos: {query.error.message}
        </p>
      ) : null}
      {query.isSuccess && query.data.items.length === 0 ? (
        <EmptyPanel
          icon={fieldIcons.file}
          title={page > 0 ? 'No hay contratos en esta página' : 'Aún no hay contratos'}
          description={
            page > 0
              ? 'El listado ha cambiado. Vuelve al inicio para consultar los contratos disponibles.'
              : 'Al aceptar un nuevo presupuesto aparecerá aquí su contrato, con las partidas pendientes de configurar como trabajos.'
          }
        >
          {page > 0 ? (
            <Button variant="outline" onPress={() => setPage(0)}>
              Volver a la primera página
            </Button>
          ) : null}
        </EmptyPanel>
      ) : null}
      {query.data?.items.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {query.data.items.map((contract) => (
            <li key={contract.id}>
              <Card className="h-full">
                <CardContent className="space-y-2 p-4">
                  <Link
                    to="/contratos/$contractId"
                    params={{ contractId: contract.id }}
                    className="text-primary font-semibold underline-offset-4 hover:underline"
                  >
                    {contract.title}
                  </Link>
                  <p className="text-muted-foreground text-sm">
                    {clients.find((client) => client.id === contract.client_id)?.name ?? 'Cliente'}{' '}
                    · {statusLabels[contract.status]}
                  </p>
                  <p className="text-sm">
                    {formatEuros(contract.price_cents)} ·{' '}
                    {contractBillingLabels[contract.billing_frequency]}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
      {query.data && query.data.count > 0 ? (
        <div className="flex items-center justify-between text-sm">
          <span>{query.data.count} contratos</span>
          <div className="flex gap-2">
            <Button variant="outline" isDisabled={page === 0} onPress={() => setPage(page - 1)}>
              Anterior
            </Button>
            <Button
              variant="outline"
              isDisabled={(page + 1) * query.data.pageSize >= query.data.count}
              onPress={() => setPage(page + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
