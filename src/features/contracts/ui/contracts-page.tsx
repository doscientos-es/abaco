import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
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
import { TableColumnsCells, TableColumnsHeader, useTableColumns } from '@/shared/ui/table-columns'
import { WorkspacePageHeading, WorkspacePageTabs } from '@/shared/ui/workspace-page-chrome'

import { listServiceContracts } from '../application/contract-actions'
import type { ContractStatusFilter } from '../domain/contract-status'
import { ContractActions } from './contract-actions'
import { ContractJobsPage } from './contract-jobs-page'
import { ContractNextCollectionCell } from './contract-next-collection'
import { ContractStatusBadge } from './contract-status-badge'
import { ContractTemplateLibrary } from './contract-template-library'

const contractColumns = [
  { id: 'title', label: 'Contrato', required: true },
  { id: 'client', label: 'Cliente' },
  { id: 'status', label: 'Estado' },
  { id: 'signature', label: 'Firma' },
  { id: 'amount', label: 'Importe', headClassName: 'text-right' },
  { id: 'billing', label: 'Facturación' },
  { id: 'collection', label: 'Próximo cobro' },
] as const

export function ContractsPage() {
  const { tab } = useSearch({ from: '/contratos/' })
  const navigate = useNavigate({ from: '/contratos/' })
  const session = useSession()
  const canEditTemplates = can(session?.role, 'contracts:write')
  const selected =
    tab === 'trabajos' || (tab === 'plantillas' && canEditTemplates) ? tab : 'contratos'
  return (
    <div className="space-y-4 md:space-y-5">
      <WorkspacePageHeading
        title="Contratos"
        actions={
          <Link
            to="/trabajos"
            className="text-primary inline-flex items-center text-sm underline max-md:min-h-11"
          >
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
  const columns = useTableColumns('contratos', contractColumns)
  return (
    <div className="min-w-0 space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground text-xs font-medium">Estado</span>
          <SelectField
            label="Estado del contrato"
            hideLabel
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
            className="max-w-xs min-w-0"
          />
        </div>
        <Link
          to="/presupuestos"
          className="text-primary inline-flex items-center text-sm underline max-md:min-h-11"
        >
          Ver presupuestos
        </Link>
      </div>
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
        <>
          <ul aria-label="Contratos de servicio" className="space-y-2 md:hidden">
            {query.data.items.map((contract) => (
              <li key={contract.id} className="border-border bg-card rounded-lg border">
                <Link
                  to="/contratos/$contractId"
                  params={{ contractId: contract.id }}
                  className="active:bg-muted/60 block space-y-1 rounded-lg px-3 pt-3"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 font-medium break-words">{contract.title}</span>
                    <ContractStatusBadge status={contract.status} />
                  </span>
                  <span className="text-muted-foreground block text-xs break-words max-md:text-[0.8125rem]">
                    {clients.find((client) => client.id === contract.client_id)?.name ?? 'Cliente'}
                  </span>
                  <span className="text-muted-foreground block text-xs max-md:text-[0.8125rem]">
                    {contract.signed_at ? 'Firmado' : 'Pendiente de firma'} ·{' '}
                    {contractBillingLabels[contract.billing_frequency]}
                  </span>
                  <div className="text-xs">
                    <ContractNextCollectionCell collection={contract.next_collection} />
                  </div>
                </Link>
                <div className="flex items-center justify-between gap-2 px-3 pb-2">
                  <span className="font-semibold tabular-nums">
                    {formatEuros(contract.price_cents)}
                  </span>
                  <ContractActions contract={contract} />
                </div>
              </li>
            ))}
          </ul>
          <Table aria-label="Contratos de servicio" containerClassName="max-md:hidden">
            <TableHeader>
              <TableRow>
                <TableColumnsHeader columns={columns} tableName="contratos" />
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
                  <TableColumnsCells
                    columns={columns}
                    cells={{
                      title: (
                        <TableCell className="min-w-48 font-medium">
                          <Link
                            to="/contratos/$contractId"
                            params={{ contractId: contract.id }}
                            className="underline-offset-4 hover:underline"
                          >
                            {contract.title}
                          </Link>
                        </TableCell>
                      ),
                      client: (
                        <TableCell>
                          {clients.find((client) => client.id === contract.client_id)?.name ??
                            'Cliente'}
                        </TableCell>
                      ),
                      status: (
                        <TableCell>
                          <ContractStatusBadge status={contract.status} />
                        </TableCell>
                      ),
                      signature: (
                        <TableCell>
                          <Badge variant={contract.signed_at ? 'success' : 'neutral'}>
                            {contract.signed_at ? 'Firmado' : 'Pendiente de firma'}
                          </Badge>
                        </TableCell>
                      ),
                      amount: (
                        <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                          {formatEuros(contract.price_cents)}
                        </TableCell>
                      ),
                      billing: (
                        <TableCell className="whitespace-nowrap">
                          {contractBillingLabels[contract.billing_frequency]}
                        </TableCell>
                      ),
                      collection: (
                        <TableCell className="whitespace-nowrap">
                          <ContractNextCollectionCell collection={contract.next_collection} />
                        </TableCell>
                      ),
                    }}
                  />
                  <TableCell className="text-right">
                    <ContractActions contract={contract} />
                  </TableCell>
                </NavigableTableRow>
              ))}
            </TableBody>
          </Table>
        </>
      ) : null}
      {query.data && query.data.count > 0 ? (
        <div className="flex items-center justify-between text-sm">
          <span aria-live="polite">{query.data.count} contratos</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="max-md:min-h-11"
              isDisabled={page === 0}
              onPress={() => setPage(page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              className="max-md:min-h-11"
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
