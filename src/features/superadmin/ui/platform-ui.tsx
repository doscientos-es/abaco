import {
  Alert,
  AlertAction,
  AlertTitle,
  Badge,
  Button,
  buttonVariants,
  FormFeedback,
  type FormFeedbackState,
  Input,
  Spinner,
} from '@doscientos/ui'
import {
  ArrowLeft,
  CaretLeft,
  CaretRight,
  MagnifyingGlass,
  PencilSimple,
} from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, type ReactNode } from 'react'

import {
  platformMaxPage,
  platformPageSize,
  type PlatformSearch,
} from '../domain/platform-navigation'
import { PlatformField } from './platform-form-field'

export const platformActionClass = buttonVariants({ variant: 'outline', size: 'sm' })
export const platformTextActionClass = buttonVariants({ variant: 'ghost', size: 'sm' })
export const platformPanelClass = 'border-border bg-card overflow-hidden rounded-lg border'

export function PlatformBackLink({
  search,
  children,
}: {
  search: PlatformSearch
  children: ReactNode
}) {
  return (
    <Link to="/superadmin" search={search} className={`${platformTextActionClass} w-fit`}>
      <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
      {children}
    </Link>
  )
}

export function PlatformEditLink({
  search,
  children,
}: {
  search: PlatformSearch
  children: ReactNode
}) {
  return (
    <Link to="/superadmin" search={search} className={platformActionClass}>
      <PencilSimple aria-hidden="true" className="size-4 shrink-0" />
      {children}
    </Link>
  )
}

export function PlatformRowLink({
  search,
  children,
  aside,
}: {
  search: PlatformSearch
  children: ReactNode
  aside?: ReactNode
}) {
  return (
    <Link
      to="/superadmin"
      search={search}
      className="focus-visible:outline-ring hover:bg-muted/60 group flex items-center gap-2 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2"
    >
      <span className="min-w-0 flex-1 break-words">{children}</span>
      {aside ? <span className="shrink-0 text-right">{aside}</span> : null}
      <CaretRight
        aria-hidden="true"
        className="text-muted-foreground group-hover:text-foreground size-4 shrink-0"
      />
    </Link>
  )
}

export const platformRowTitleClass = 'group-hover:text-primary block font-medium'
export const platformRowMetaClass = 'text-muted-foreground block text-xs'

export function PlatformRecordLink({
  search,
  children,
}: {
  search: PlatformSearch
  children: ReactNode
}) {
  return (
    <Link
      to="/superadmin"
      search={search}
      className="focus-visible:outline-ring hover:text-primary inline-block max-w-full rounded-sm font-medium break-words hover:underline focus-visible:outline-2"
    >
      {children}
    </Link>
  )
}

const date = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' })
export const formatPlatformDate = (value: string | null) =>
  value ? date.format(new Date(value)) : '—'
export const billingPeriodLabel = (period: string | null) => {
  if (period === 'month') return 'Mensual'
  if (period === 'year') return 'Anual'
  return 'Sin periodo'
}

const invoiceStatuses = new Map([
  ['pending', 'Pendiente de emisión'],
  ['retrying', 'Error de integración · reintento programado'],
  ['fiscal_pending', 'Pendiente de respuesta de AEAT'],
  ['fiscal_review', 'Revisar rechazo fiscal en Backoffice'],
  ['invoice_review', 'Revisar factura en Backoffice'],
  ['email_pending', 'Correo pendiente · reintento programado'],
  ['email_review', 'Comprobar entrega antes de reenviar'],
  ['sent', 'Correo aceptado por el proveedor'],
])

export const invoiceStatusLabel = (status: string | null | undefined, number?: string | null) =>
  invoiceStatuses.get(status ?? '') ?? (number ? 'Factura numerada' : 'Sin solicitud de factura')

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
  if (onRetry)
    return (
      <div className="p-3">
        <Alert variant="destructive">
          <AlertTitle>{title}</AlertTitle>
          <AlertAction>
            <Button size="xs" variant="outline" onPress={onRetry}>
              Reintentar
            </Button>
          </AlertAction>
        </Alert>
      </div>
    )
  return (
    <div className="space-y-1 px-3 py-5 text-center text-sm">
      <p className="font-medium">{title}</p>
      {children ? <p className="text-muted-foreground text-sm">{children}</p> : null}
    </div>
  )
}

export function PlatformLoading({ children }: { children: string }) {
  return (
    <div className="text-muted-foreground flex items-center gap-2 px-3 py-4 text-sm">
      <Spinner size="sm" label={children} />
      <span aria-hidden="true">{children}</span>
    </div>
  )
}

export function PlatformFeedback({
  action,
  success,
}: {
  action: { isPending: boolean; isSuccess: boolean; error: Error | null }
  success: string
}) {
  const state: FormFeedbackState = action.isPending
    ? { status: 'pending' }
    : action.error
      ? { status: 'error', message: action.error.message }
      : action.isSuccess
        ? { status: 'success', message: success }
        : { status: 'idle' }
  return <FormFeedback state={state} className="h-auto min-h-5" />
}

export function PlatformPagination({
  page,
  count,
  hasMore = count >= platformPageSize,
  onChange,
}: {
  page: number
  count: number
  hasMore?: boolean
  onChange: (page: number) => void
}) {
  if (page === 1 && !hasMore) return null
  return (
    <nav
      aria-label="Paginación"
      className="border-border flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2"
    >
      <span className="text-muted-foreground text-xs tabular-nums">Página {page}</span>
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
          isDisabled={!hasMore || page >= platformMaxPage}
          onPress={() => onChange(page + 1)}
        >
          Siguiente <CaretRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  )
}

export function PlatformSearchForm({
  query,
  label,
  placeholder,
  onSearch,
}: {
  query: string
  label: string
  placeholder: string
  onSearch: (value: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (inputRef.current) inputRef.current.value = query
  }, [query])
  return (
    <search aria-label={label} className="w-full sm:w-auto">
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const input = inputRef.current
          if (!input) return
          const normalized = input.value.trim()
          input.value = normalized
          onSearch(normalized)
        }}
      >
        <PlatformField label={label} className="flex-1 sm:w-64">
          {(control) => (
            <Input
              {...control}
              ref={inputRef}
              type="search"
              placeholder={placeholder}
              maxLength={120}
              defaultValue={query}
            />
          )}
        </PlatformField>
        <Button type="submit" variant="outline">
          <MagnifyingGlass aria-hidden="true" /> Buscar
        </Button>
      </form>
    </search>
  )
}
