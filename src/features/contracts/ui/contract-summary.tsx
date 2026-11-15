import { Button } from '@doscientos/ui'
import { CalendarBlank, CurrencyEur, PencilSimple } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'

import { contractBillingLabels } from '@/shared/domain/contract-billing'
import { formatEuros } from '@/shared/domain/money'
import type { Client } from '@/shared/domain/types'
import { calendarDate } from '@/shared/lib/date-range'

import type { ServiceContract } from '../application/contract-actions'
import { ContractAgreementForm } from './contract-agreement-form'
import { ContractLocations } from './contract-locations'
import { ContractQuickActions } from './contract-quick-actions'
import { ContractStatusPanel } from './contract-status-panel'

const dateFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' })
const dateLabel = (date: string | null) =>
  date ? dateFormat.format(calendarDate(date)) : 'Sin definir'

function StepHeading({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
      >
        {number}
      </span>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
    </div>
  )
}

export function ContractSummary({
  contract,
  canEdit,
  client,
  active = true,
  onPrint,
  onViewDocument,
  children,
}: {
  contract: ServiceContract
  canEdit: boolean
  client?: Client | undefined
  active?: boolean
  onPrint: () => void
  onViewDocument: () => void
  children: ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const canEditDetails = canEdit && contract.status === 'draft'

  return (
    <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
      <div className="min-w-0 space-y-6">
        <section className="space-y-4" aria-label="Datos básicos del contrato">
          <StepHeading number={1} title="Datos básicos" />
          <div className="border-border bg-card space-y-5 rounded-xl border p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="font-semibold">Condiciones del contrato</h3>
              {canEditDetails && !editing ? (
                <Button variant="outline" size="sm" onPress={() => setEditing(true)}>
                  <PencilSimple aria-hidden="true" className="size-4" /> Editar datos
                </Button>
              ) : null}
            </div>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="bg-muted/40 flex gap-3 rounded-lg p-4">
                <CalendarBlank aria-hidden="true" className="text-primary mt-0.5 size-5 shrink-0" />
                <div>
                  <dt className="text-muted-foreground text-xs">Inicio</dt>
                  <dd className="mt-1 text-sm font-medium">{dateLabel(contract.starts_on)}</dd>
                </div>
              </div>
              <div className="bg-muted/40 flex gap-3 rounded-lg p-4">
                <CalendarBlank aria-hidden="true" className="text-primary mt-0.5 size-5 shrink-0" />
                <div>
                  <dt className="text-muted-foreground text-xs">Fin</dt>
                  <dd className="mt-1 text-sm font-medium">{dateLabel(contract.ends_on)}</dd>
                </div>
              </div>
              <div className="bg-muted/40 flex gap-3 rounded-lg p-4">
                <CurrencyEur aria-hidden="true" className="text-primary mt-0.5 size-5 shrink-0" />
                <div>
                  <dt className="text-muted-foreground text-xs">
                    Importe · {contractBillingLabels[contract.billing_frequency]}
                  </dt>
                  <dd className="mt-1 text-sm font-medium">
                    {contract.price_cents > 0
                      ? formatEuros(contract.price_cents)
                      : 'Pendiente / no facturable'}
                  </dd>
                </div>
              </div>
            </dl>
            {contract.notes ? (
              <div>
                <h4 className="text-muted-foreground text-xs font-medium">Notas</h4>
                <p className="mt-1 text-sm whitespace-pre-wrap">{contract.notes}</p>
              </div>
            ) : null}
            {contract.origin_estimate_id ? (
              <Link
                to="/presupuestos/$estimateId"
                params={{ estimateId: contract.origin_estimate_id }}
                className="text-primary inline-block text-sm font-medium hover:underline"
              >
                Ver presupuesto aceptado →
              </Link>
            ) : null}
            {editing && canEditDetails ? (
              <ContractAgreementForm
                key={contract.updated_at}
                contract={contract}
                onSaved={() => setEditing(false)}
                onCancel={() => setEditing(false)}
              />
            ) : null}
            {canEdit && contract.status !== 'draft' ? (
              <p className="text-muted-foreground text-xs">
                La vigencia y las notas solo se pueden editar antes de activar el contrato.
              </p>
            ) : null}
          </div>
          {active ? <ContractLocations contract={contract} /> : null}
        </section>
        <section className="space-y-4" aria-label="Configuración de trabajos">
          <StepHeading number={2} title="Configurar trabajos" />
          {children}
        </section>
        <section className="space-y-4" aria-label="Activación del contrato">
          <StepHeading number={3} title="Activación" />
          <ContractStatusPanel key={contract.id} contract={contract} />
        </section>
      </div>
      {active ? (
        <aside className="space-y-5" aria-label="Acciones del contrato">
          <ContractQuickActions
            contract={contract}
            client={client}
            onPrint={onPrint}
            onViewDocument={onViewDocument}
          />
        </aside>
      ) : null}
    </div>
  )
}
