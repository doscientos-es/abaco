import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { useSession } from '@/features/auth'

import {
  platformAccessQuery,
  platformCompaniesQuery,
  platformPaymentsQuery,
  platformPaymentSummaryQuery,
  type PlatformCompany,
} from '../application/superadmin-queries'

const date = (value: string | null) =>
  value ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(value)) : '—'
const money = (cents: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100)

export function SuperadminPage() {
  const session = useSession()
  const access = useQuery(platformAccessQuery(session?.userId ?? ''))
  if (access.isPending) return <p>Cargando acceso…</p>
  if (access.isError) return <p role="alert">No se pudo comprobar el acceso. Inténtalo de nuevo.</p>
  if (!access.data) return <p role="alert">No tienes acceso al panel de plataforma.</p>
  return <CompanyBrowser />
}

function CompanyBrowser() {
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [company, setCompany] = useState<PlatformCompany | null>(null)
  const companies = useQuery(platformCompaniesQuery(search.trim(), offset))
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <Link to="/" className="text-primary text-sm">
          ← Volver a la aplicación
        </Link>
        <h1 className="text-2xl font-semibold">Administración de Ábaco</h1>
        <p className="text-muted-foreground text-sm">Empresas y pagos de la plataforma.</p>
      </header>
      {company ? (
        <CompanyDetail key={company.id} company={company} onBack={() => setCompany(null)} />
      ) : (
        <section className="space-y-4">
          <label className="block text-sm font-medium" htmlFor="platform-search">
            Buscar empresa
          </label>
          <input
            id="platform-search"
            className="border-border bg-background w-full rounded-md border px-3 py-2"
            maxLength={120}
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value)
              setOffset(0)
            }}
          />
          {companies.isPending ? <p>Cargando empresas…</p> : null}
          {companies.isError ? <p role="alert">No se pudieron cargar las empresas.</p> : null}
          {companies.data?.length === 0 ? <p>No hay empresas para esta búsqueda.</p> : null}
          <ul className="divide-border divide-y">
            {companies.data?.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="w-full py-3 text-left"
                  onClick={() => setCompany(item)}
                >
                  <span className="font-medium">{item.name}</span>
                  <span className="text-muted-foreground block text-sm">
                    {item.plan} · {item.subscription_status} · {item.member_count} personas ·
                    Renovación: {date(item.current_period_end)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Pagination offset={offset} count={companies.data?.length ?? 0} onChange={setOffset} />
        </section>
      )}
    </main>
  )
}

function CompanyDetail({ company, onBack }: { company: PlatformCompany; onBack: () => void }) {
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState('')
  const payments = useQuery(platformPaymentsQuery(company.id, offset, status))
  const summary = useQuery(platformPaymentSummaryQuery(company.id))
  return (
    <section className="space-y-4">
      <button type="button" onClick={onBack} className="text-primary text-sm">
        ← Empresas
      </button>
      <h2 className="text-xl font-semibold">{company.name}</h2>
      <p className="text-muted-foreground text-sm">
        Plan: {company.plan} · Estado: {company.subscription_status} · Personas:{' '}
        {company.member_count}
        {' · '}Periodo: {company.billing_interval ?? '—'} · Renovación:{' '}
        {date(company.current_period_end)}
        {company.is_complimentary ? ' · Cortesía' : ''}
      </p>
      <h3 className="font-semibold">Pagos</h3>
      {summary.isPending ? <p>Cargando resumen…</p> : null}
      {summary.isError ? <p role="alert">No se pudo cargar el resumen de pagos.</p> : null}
      {summary.data ? (
        <p className="text-sm">
          Cobrados: {summary.data.succeeded_count} ({money(summary.data.succeeded_cents)}) ·
          Fallidos: {summary.data.failed_count} · Pendientes: {summary.data.pending_count}
        </p>
      ) : null}
      <label htmlFor="platform-payment-status" className="text-sm">
        Estado
      </label>{' '}
      <select
        id="platform-payment-status"
        value={status}
        onChange={(event) => {
          setStatus(event.currentTarget.value)
          setOffset(0)
        }}
      >
        <option value="">Todos</option>
        <option value="succeeded">Cobrado</option>
        <option value="failed">Fallido</option>
        <option value="pending">Pendiente</option>
      </select>
      {payments.isPending ? <p>Cargando pagos…</p> : null}
      {payments.isError ? <p role="alert">No se pudieron cargar los pagos.</p> : null}
      {payments.data?.length === 0 ? <p>No hay pagos para este filtro.</p> : null}
      <ul className="divide-border divide-y">
        {payments.data?.map((payment) => (
          <li key={payment.id} className="py-3 text-sm">
            {date(payment.created_at)} · {money(payment.amount_cents)} IVA incluido ·{' '}
            {payment.status} · {payment.plan} / {payment.period}
          </li>
        ))}
      </ul>
      <Pagination offset={offset} count={payments.data?.length ?? 0} onChange={setOffset} />
    </section>
  )
}

function Pagination({
  offset,
  count,
  onChange,
}: {
  offset: number
  count: number
  onChange: (n: number) => void
}) {
  return (
    <div className="flex gap-4 text-sm">
      <button
        type="button"
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - 50))}
      >
        Anterior
      </button>
      <button type="button" disabled={count < 50} onClick={() => onChange(offset + 50)}>
        Siguiente
      </button>
    </div>
  )
}
