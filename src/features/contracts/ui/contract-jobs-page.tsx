import { Button } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { useTenantData } from '@/shared/store/store'

import { listContractJobs } from '../application/cleaning-service-actions'
import { jobFrequencyLabels } from '../domain/contract-job'
import { contractStatusLabels } from '../domain/contract-status'

export function ContractJobsPage() {
  const { tenant, clients } = useTenantData()
  const [page, setPage] = useState(0)
  const jobs = useQuery({
    queryKey: ['contract-jobs', tenant.id, page],
    queryFn: () => listContractJobs(tenant.id, page),
  })
  return (
    <section className="space-y-4" aria-label="Trabajos contratados">
      <h2 className="text-xl font-semibold">Trabajos contratados</h2>
      <p className="text-muted-foreground text-sm">
        Cada trabajo pertenece a un contrato: puede realizarse una vez o periódicamente. Su
        planificación y sus partes se consultan en las vistas de lista y calendario de Trabajos.
      </p>
      <div className="flex gap-4 text-sm">
        <Link to="/contratos" className="text-primary underline">
          Ver contratos y configurar trabajos
        </Link>
      </div>
      {jobs.isPending ? <output>Cargando trabajos…</output> : null}
      {jobs.isError ? (
        <div role="alert">
          <p>{jobs.error.message}</p>
          <Button variant="outline" onPress={() => void jobs.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {jobs.data?.items.length === 0 ? (
        <p>Aún no hay trabajos. Se crean a partir de las partidas del presupuesto aceptado.</p>
      ) : null}
      <ul className="divide-y rounded-lg border">
        {jobs.data?.items.map((job) => (
          <li key={job.id} className="space-y-1 p-4">
            <Link
              to="/contratos/$contractId"
              params={{ contractId: job.contract.id }}
              hash={job.id}
              className="text-primary font-semibold underline"
            >
              {job.title}
            </Link>
            <p className="text-sm">
              {clients.find((client) => client.id === job.contract.client_id)?.name ?? 'Cliente'} ·{' '}
              {job.contract.title}
            </p>
            <p className="text-muted-foreground text-sm">
              {job.configured
                ? `${job.location?.name ?? 'Centro del contrato'} · ${job.frequency ? jobFrequencyLabels[job.frequency] : 'Pauta anterior'} · ${job.modality === 'fixed' ? 'Hoja permanente' : 'Órdenes por visita'}`
                : 'Pendiente de configurar'}
            </p>
            <p className="text-muted-foreground text-xs">
              Estado del contrato: {contractStatusLabels[job.contract.status]}
            </p>
          </li>
        ))}
      </ul>
      {jobs.data && (page > 0 || jobs.data.count > jobs.data.pageSize) ? (
        <div className="flex items-center gap-3">
          <Button variant="outline" isDisabled={page === 0} onPress={() => setPage(page - 1)}>
            Anterior
          </Button>
          <span>{jobs.data.count} trabajos</span>
          <Button
            variant="outline"
            isDisabled={(page + 1) * jobs.data.pageSize >= jobs.data.count}
            onPress={() => setPage(page + 1)}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </section>
  )
}
