import { Badge, Button } from '@doscientos/ui'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

import { planCatalog } from '@/features/billing'

import { platformMaxPage, platformPageSize } from '../domain/platform-navigation'

const date = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' })
export const formatPlatformDate = (value: string | null) =>
  value ? date.format(new Date(value)) : '—'
export const platformPlanLabel = (plan: string) =>
  plan === 'trial' ? 'Prueba' : (planCatalog.find((item) => item.id === plan)?.name ?? plan)
export const billingPeriodLabel = (period: string | null) => {
  if (period === 'month') return 'Mensual'
  if (period === 'year') return 'Anual'
  return 'Sin periodo'
}

const companyStatuses = {
  trialing: { label: 'En prueba', variant: 'info' },
  active: { label: 'Activa', variant: 'success' },
  past_due: { label: 'Pago pendiente', variant: 'warning' },
  canceled: { label: 'Cancelada', variant: 'neutral' },
} as const

export function CompanyStatus({ status }: { status: string }) {
  const entry = companyStatuses[status as keyof typeof companyStatuses]
  return (
    <Badge variant={entry?.variant ?? 'neutral'} icon={false}>
      {entry?.label ?? 'Sin estado'}
    </Badge>
  )
}

export function PlatformMessage({
  title,
  children,
  onRetry,
}: {
  title: string
  children?: ReactNode
  onRetry?: () => void
}) {
  return (
    <div className="space-y-2 px-4 py-8 text-center">
      <p role={onRetry ? 'alert' : undefined} className="font-medium">
        {title}
      </p>
      {children ? <p className="text-muted-foreground text-sm">{children}</p> : null}
      {onRetry ? (
        <Button size="sm" variant="outline" onPress={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  )
}

export function PlatformPagination({
  page,
  count,
  onChange,
}: {
  page: number
  count: number
  onChange: (page: number) => void
}) {
  if (page === 1 && count < platformPageSize) return null
  return (
    <nav
      aria-label="Paginación"
      className="border-border flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3"
    >
      <span className="text-muted-foreground text-sm">Página {page}</span>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          isDisabled={page === 1}
          onPress={() => onChange(page - 1)}
        >
          <CaretLeft aria-hidden="true" /> Anterior
        </Button>
        <Button
          size="sm"
          variant="outline"
          isDisabled={count < platformPageSize || page >= platformMaxPage}
          onPress={() => onChange(page + 1)}
        >
          Siguiente <CaretRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  )
}
