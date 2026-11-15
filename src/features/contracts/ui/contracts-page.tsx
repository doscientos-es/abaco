import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { can, useSession } from '@/features/auth'
import { contractBillingLabels } from '@/shared/domain/contract-billing'
import { formatEuros } from '@/shared/domain/money'
import { useTenantData } from '@/shared/store/store'
import { fieldIcons } from '@/shared/ui/field-icons'
import { SelectField } from '@/shared/ui/form'
import { NavigableTableRow } from '@/shared/ui/navigable-table-row'
import { EmptyPanel } from '@/shared/ui/page-states'
import { WorkspacePageHeading, WorkspacePageTabs } from '@/shared/ui/workspace-page-chrome'

import { listServiceContracts } from '../application/contract-actions'
import type { ContractStatusFilter } from '../domain/contract-status'
import { ContractActions } from './contract-actions'
import { ContractJobsPage } from './contract-jobs-page'
import { ContractNextCollectionCell } from './contract-next-collection'
import { ContractStatusBadge } from './contract-status-badge'
import { ContractTemplateLibrary } from './contract-template-library'

export function ContractsPage() {
  const { tab } = useSearch({ from: '/contratos/' })
  const navigate = useNavigate({ from: '/contratos/' })
  const session = useSession()
  const canEditTemplates = can(session?.role, 'contracts:write')
  const selected =
    tab === 'trabajos' || (tab === 'plantillas' && canEditTemplates) ? tab : 'contratos'
  return (
    <div className="space-y-5">
      <WorkspacePageHeading
        title="Contratos de servicio"
        actions={
          <Link to="/trabajos" className="text-primary text-sm underline">
            Ir a planificación
          </Link>
        }
      />
      <Tabs
        className="block"
        selectedKey={selected}
        onSelectionChange={(key) =>
          void navigate({
            to: '/contratos',
            search: key === 'trabajos' || key === 'plantillas' ? { tab: key } : {},
          })
        }
      >
        <WorkspacePageTabs>
          <TabsList aria-label="Secciones de contratos">
            <TabsTrigger id="contratos">Contratos</TabsTrigger>
            <TabsTrigger id="trabajos">Trabajos contratados</TabsTrigger>
            {canEditTemplates ? <TabsTrigger id="plantillas">Plantillas</TabsTrigger> : null}
          </TabsList>
        </WorkspacePageTabs>
        <TabsContent id={selected} key={selected}>
          {selected === 'contratos' ? (
            <ContractsList />
          ) : selected === 'trabajos' ? (
            <ContractJobsPage />
          ) : (
            <ContractTemplates />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ContractTemplates() {
  const { tenant } = useTenantData()
  return <ContractTemplateLibrary tenantId={tenant.id} />
}

function ContractsList() {
  const { tenant, clients } = useTenantData()
  const navigate = useNavigate()
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState<ContractStatusFilter>('all')
  const query = useQuery({
    queryKey: ['service-contracts', tenant.id, page, status],
    queryFn: () => listServiceContracts(tenant.id, page, status),
  })
  return (
    <div className="space-y-6">
      <Link to="/presupuestos" className="text-primary text-sm underline">
        Crear o revisar presupuesto
      </Link>
      <SelectField
        label="Estado del contrato"
        value={status}
        options={[
          { value: 'all', label: 'Todos' },
          { value: 'active', label: 'Activos' },
          { value: 'inactive', label: 'Inactivos' },
        ]}
        onChange={(value) => {
          setStatus(value as ContractStatusFilter)
          setPage(0)
        }}
        className="max-w-xs"
      />
      {query.isPending ? <output>Cargando contratos…</output> : null}
      {query.isError ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudieron cargar los contratos: {query.error.message}
        </p>
      ) : null}
      {query.isSuccess && query.data.items.length === 0 ? (
        <EmptyPanel
          icon={fieldIcons.file}
          title={
            page > 0
              ? 'No hay contratos en esta página'
              : status === 'all'
                ? 'Aún no hay contratos'
                : `No hay contratos ${status === 'active' ? 'activos' : 'inactivos'}`
          }
          description={
            page > 0
              ? 'El listado ha cambiado. Vuelve al inicio para consultar los contratos disponibles.'
              : status === 'all'
                ? 'Al aceptar un nuevo presupuesto aparecerá aquí su contrato, con las partidas pendientes de configurar como trabajos.'
                : 'Prueba con otro estado para consultar el resto de contratos.'
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
        <Table aria-label="Contratos de servicio">
          <TableHeader>
            <TableRow>
              <TableHead>Contrato</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Firma</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead>Facturación</TableHead>
              <TableHead>Próximo cobro</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data.items.map((contract) => (
              <NavigableTableRow
                key={contract.id}
                onOpen={() =>
                  void navigate({
                    to: '/contratos/$contractId',
                    params: { contractId: contract.id },
                  })
                }
              >
                <TableCell className="min-w-48 font-medium">
                  <Link
                    to="/contratos/$contractId"
                    params={{ contractId: contract.id }}
                    className="underline-offset-4 hover:underline"
                  >
                    {contract.title}
                  </Link>
                </TableCell>
                <TableCell>
                  {clients.find((client) => client.id === contract.client_id)?.name ?? 'Cliente'}
                </TableCell>
                <TableCell>
                  <ContractStatusBadge status={contract.status} />
                </TableCell>
                <TableCell>
                  <Badge variant={contract.signed_at ? 'success' : 'neutral'}>
                    {contract.signed_at ? 'Firmado' : 'Pendiente de firma'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                  {formatEuros(contract.price_cents)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {contractBillingLabels[contract.billing_frequency]}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <ContractNextCollectionCell collection={contract.next_collection} />
                </TableCell>
                <TableCell className="text-right">
                  <ContractActions contract={contract} />
                </TableCell>
              </NavigableTableRow>
            ))}
          </TableBody>
        </Table>
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
