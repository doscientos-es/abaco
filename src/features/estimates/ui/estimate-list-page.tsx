import {
  Button,
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@doscientos/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { ClientFormDialog } from '@/features/clients/ui/client-form-dialog'
import { estimateTotalCents } from '@/shared/domain/estimate'
import { formLimits } from '@/shared/domain/form-limits'
import { fuzzySearch } from '@/shared/domain/fuzzy-search'
import { formatEuros } from '@/shared/domain/money'
import type { EstimateStatus } from '@/shared/domain/types'
import { useTenantData } from '@/shared/store/store'
import { fieldIcons } from '@/shared/ui/field-icons'
import { SelectField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'
import { EmptyPanel } from '@/shared/ui/page-states'
import { StatusBadge, statusLabels } from '@/shared/ui/status-badge'
import { TablePagination, usePagination } from '@/shared/ui/use-pagination'

import { createEstimate } from '../application/estimate-actions'

export function EstimateListPage() {
  const { estimates, clients } = useTenantData()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'all' | EstimateStatus>('all')
  const [query, setQuery] = useState('')
  const visible = estimates.filter((e) => {
    const client = clients.find((c) => c.id === e.clientId)
    const statusLabel = statusLabels[e.status]
    return (
      (status === 'all' || e.status === status) &&
      fuzzySearch(query, e.number, e.title, statusLabel, client?.name ?? '')
    )
  })
  const pager = usePagination(visible, `${status}|${query.trim().toLocaleLowerCase('es')}`)

  const [creating, setCreating] = useState(false)
  const [newClientId, setNewClientId] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [creatingClient, setCreatingClient] = useState(false)

  function startNew() {
    setNewClientId(clients[0]?.id ?? '')
    setNewTitle('')
    setCreating(true)
  }

  function confirmNew() {
    if (!newClientId) return
    const id = createEstimate(newClientId, newTitle)
    setCreating(false)
    void navigate({ to: '/presupuestos/$estimateId', params: { estimateId: id } })
  }

  return (
    <div className="space-y-8">
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>Presupuestos</PageHeaderTitle>
          <PageHeaderDescription>
            Crea, envía y sigue cada propuesta hasta el cobro.
          </PageHeaderDescription>
        </PageHeaderHeading>
        <PageHeaderActions>
          <Button onPress={startNew}>Crear presupuesto</Button>
        </PageHeaderActions>
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          type="search"
          aria-label="Buscar presupuestos"
          maxLength={formLimits.searchQuery}
          placeholder="Buscar por número, obra o cliente…"
          className="sm:max-w-sm sm:flex-1"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <SelectField
          label="Filtrar por estado"
          hideLabel
          className="sm:w-52"
          value={status}
          options={[
            { value: 'all', label: 'Todos los estados' },
            ...Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
          ]}
          onChange={(v) => setStatus(v as 'all' | EstimateStatus)}
        />
        {query || status !== 'all' ? (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              setQuery('')
              setStatus('all')
            }}
          >
            Limpiar filtros
          </Button>
        ) : null}
        <p className="text-muted-foreground text-sm tabular-nums">
          {visible.length} {visible.length === 1 ? 'presupuesto' : 'presupuestos'}
        </p>
      </div>

      {visible.length === 0 ? (
        estimates.length === 0 ? (
          <EmptyPanel
            icon={fieldIcons.file}
            title="Aún no has hecho ningún presupuesto"
            description="Crea el primero en menos de un minuto: eliges el cliente, añades las partidas y se lo envías."
          >
            <Button onPress={startNew}>+ Crear mi primer presupuesto</Button>
          </EmptyPanel>
        ) : (
          <EmptyPanel
            icon={fieldIcons.search}
            title="Sin resultados"
            description="Prueba otra búsqueda o limpia los filtros para ver todos los presupuestos."
          >
            <Button
              variant="outline"
              onPress={() => {
                setQuery('')
                setStatus('all')
              }}
            >
              Limpiar filtros
            </Button>
          </EmptyPanel>
        )
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {pager.pageItems.map((estimate) => (
              <li key={estimate.id}>
                <Link
                  to="/presupuestos/$estimateId"
                  params={{ estimateId: estimate.id }}
                  className="border-border bg-card active:bg-muted/60 block space-y-2 rounded-lg border p-4 shadow-(--ui-shadow-hairline)"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0 font-medium">{estimate.title}</span>
                    <StatusBadge status={estimate.status} />
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {estimate.number} ·{' '}
                    {clients.find((c) => c.id === estimate.clientId)?.name ?? 'Sin cliente'}
                  </span>
                  <span className="block text-lg font-semibold tabular-nums">
                    {formatEuros(estimateTotalCents(estimate))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Table containerClassName="hidden md:block">
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Obra</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pager.pageItems.map((estimate) => (
                <TableRow key={estimate.id}>
                  <TableCell className="text-muted-foreground">{estimate.number}</TableCell>
                  <TableCell className="font-medium">
                    <Link
                      to="/presupuestos/$estimateId"
                      params={{ estimateId: estimate.id }}
                      className="underline-offset-4 hover:underline"
                    >
                      {estimate.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {clients.find((c) => c.id === estimate.clientId)?.name ?? 'Sin cliente'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={estimate.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatEuros(estimateTotalCents(estimate))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
      <TablePagination controller={pager} noun="presupuestos" />

      <FormDialog
        open={creating && !creatingClient}
        onOpenChange={setCreating}
        title="Nuevo presupuesto"
        description="Elige el cliente y la obra. Después añades partidas desde el catálogo."
        submitLabel="Crear y añadir partidas"
        submitDisabled={!newClientId}
        onSubmit={confirmNew}
      >
        {clients.length === 0 ? (
          <div className="border-border bg-muted/40 flex flex-col items-start gap-2 rounded-lg border border-dashed p-4 sm:col-span-2">
            <p className="text-sm font-medium">Todavía no tienes ningún cliente</p>
            <p className="text-muted-foreground text-xs">
              Créalo ahora (solo hace falta el nombre) y se añadirá a este presupuesto.
            </p>
            <Button type="button" variant="outline" onPress={() => setCreatingClient(true)}>
              + Crear cliente
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <SelectField
              label="Cliente"
              value={newClientId}
              options={[
                ...(newClientId ? [] : [{ value: '', label: 'Selecciona un cliente' }]),
                ...clients.map((c) => ({ value: c.id, label: c.name })),
              ]}
              onChange={setNewClientId}
            />
            <button
              type="button"
              className="text-primary self-start text-xs font-medium hover:underline"
              onClick={() => setCreatingClient(true)}
            >
              + Crear cliente nuevo
            </button>
          </div>
        )}
        <TextField
          label="Título de la obra"
          minLength={2}
          maxLength={formLimits.estimateTitle}
          placeholder="Ej. Reforma de baño"
          icon={fieldIcons.file}
          value={newTitle}
          onChange={setNewTitle}
        />
      </FormDialog>

      <ClientFormDialog
        open={creatingClient}
        onClose={() => setCreatingClient(false)}
        onSaved={setNewClientId}
      />
    </div>
  )
}
