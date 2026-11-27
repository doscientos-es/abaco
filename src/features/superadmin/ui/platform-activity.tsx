import {
  Badge,
  PageHeader,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
  PageStack,
} from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'

import { planLabel, subscriptionTerritories } from '@/features/billing'
import { isModuleCode, modules } from '@/features/product-modules'
import { formatEuros } from '@/shared/domain/money'

import {
  platformActivityQuery,
  type ActivityEvent,
  type ActivityValues,
} from '../application/platform-activity'
import { platformCompanyQuery } from '../application/superadmin-queries'
import {
  activityKinds,
  activitySearch,
  maxActivityPage,
  type ActivityKind,
  type PlatformSearch,
} from '../domain/platform-navigation'
import { PlatformField, PlatformSelect } from './platform-form-field'
import {
  PlatformBackLink,
  PlatformLoading,
  PlatformMessage,
  PlatformPagination,
  platformPanelClass,
  platformTextActionClass,
} from './platform-ui'

const time = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
})
const actions: Record<string, string> = {
  pause: 'Pausó la renovación',
  resume: 'Reanudó la renovación',
  archive: 'Archivó la empresa',
  restore: 'Restauró la empresa',
}
const options = [
  { id: 'all', label: 'Todas las acciones' },
  ...Object.entries(activityKinds).map(([id, label]) => ({ id, label })),
]

function eventTitle(event: ActivityEvent) {
  const subject = event.subject
  if (subject && Object.hasOwn(actions, subject)) return actions[subject]
  if (subject && isModuleCode(subject))
    return `${activityKinds[event.kind]} · ${modules[subject].name}`
  if (subject && event.kind === 'tarifa_plan') return `Tarifa de plan · ${planLabel(subject)}`
  return activityKinds[event.kind]
}

function valueLabel(value: ActivityValues, kind: ActivityKind) {
  if (kind === 'territorio') {
    const t = value.territory
    return t && Object.hasOwn(subscriptionTerritories, t)
      ? subscriptionTerritories[t as keyof typeof subscriptionTerritories]
      : 'Automático'
  }

  const parts: string[] = []
  if (value.plan) parts.push(planLabel(value.plan))
  if (typeof value.seats === 'number') parts.push(`${value.seats} plazas`)
  if (value.period === 'year') parts.push('Anual')
  if (value.period === 'month') parts.push('Mensual')
  if (typeof value.monthly_cents === 'number') parts.push(`${formatEuros(value.monthly_cents)}/mes`)
  if (typeof value.yearly_cents === 'number') parts.push(`${formatEuros(value.yearly_cents)}/año`)
  if (typeof value.seat_monthly_cents === 'number')
    parts.push(`${formatEuros(value.seat_monthly_cents)}/plaza extra al mes`)
  const base = value.base_net_cents ?? value.net_cents
  if (typeof base === 'number') parts.push(`${formatEuros(base)} sin IVA`)
  if (typeof value.vat_percent === 'number') parts.push(`IVA ${value.vat_percent} %`)
  if (typeof value.gifted === 'boolean')
    parts.push(value.gifted ? 'Cortesía activa' : 'Sin cortesía')
  if (value.price_source)
    parts.push(value.price_source === 'fixed' ? 'Precio pactado' : 'Tarifa de catálogo')
  return parts.join(' · ') || 'Sin dato registrado'
}

export function PlatformActivity({ userId, search }: { userId: string; search: PlatformSearch }) {
  const page = search.page ?? 1
  const company = search.empresa
  const navigate = useNavigate({ from: '/superadmin' })
  const activity = useQuery(platformActivityQuery(userId, company, search.accion, page))
  const companyInfo = useQuery({
    ...platformCompanyQuery(company ?? ''),
    enabled: Boolean(company),
  })

  return (
    <PageStack className="max-w-5xl">
      {company ? (
        <PlatformBackLink search={{ empresa: company }}>Volver a la empresa</PlatformBackLink>
      ) : null}
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>
            {companyInfo.data
              ? `Actividad de ${companyInfo.data.name}`
              : company
                ? 'Actividad de la empresa'
                : 'Actividad de plataforma'}
          </PageHeaderTitle>
          <PageHeaderDescription>
            Consulta quién cambió qué y cuándo. Se muestran las últimas 5.000 acciones por filtro,
            en horario peninsular.
          </PageHeaderDescription>
        </PageHeaderHeading>
      </PageHeader>
      <section aria-label="Registro de actividad" className={platformPanelClass}>
        <div className="border-border flex flex-wrap items-end gap-3 border-b p-3 sm:p-4">
          <PlatformField label="Tipo de acción" className="w-full sm:w-60">
            {(control) => (
              <PlatformSelect
                {...control}
                options={options}
                value={search.accion ?? 'all'}
                onChange={(value) =>
                  void navigate({
                    search: activitySearch(
                      company,
                      value && Object.hasOwn(activityKinds, value)
                        ? (value as ActivityKind)
                        : undefined,
                    ),
                  })
                }
              />
            )}
          </PlatformField>
          {company ? (
            <Link
              to="/superadmin"
              search={activitySearch(undefined, search.accion)}
              className={platformTextActionClass}
            >
              Ver toda la actividad
            </Link>
          ) : null}
        </div>
        {activity.isPending ? (
          <PlatformLoading>Cargando actividad…</PlatformLoading>
        ) : activity.isError ? (
          <PlatformMessage
            title="No se pudo cargar la actividad."
            onRetry={() => void activity.refetch()}
          />
        ) : (
          <>
            {activity.data.rows.length ? (
              <ul className="divide-border divide-y">
                {activity.data.rows.map((event) => (
                  <li key={event.id} className="space-y-2 p-3 sm:p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <h2 className="font-semibold">{eventTitle(event)}</h2>
                      <time
                        dateTime={event.occurred_at}
                        className="text-muted-foreground text-xs tabular-nums"
                      >
                        {time.format(new Date(event.occurred_at))}
                      </time>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <Badge variant="outline" className="h-auto max-w-full break-all">
                        {event.actor_email ?? 'Cuenta de administrador no disponible'}
                      </Badge>
                      {event.tenant_id && event.company_name ? (
                        <Link
                          to="/superadmin"
                          search={activitySearch(event.tenant_id)}
                          className="text-primary rounded-sm font-medium break-words underline underline-offset-2 focus-visible:outline-2"
                        >
                          {event.company_name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">
                          {event.tenant_id ? 'Empresa no disponible' : 'Catálogo global'}
                        </span>
                      )}
                    </div>
                    {event.before || event.after ? (
                      <dl className="bg-muted/35 grid gap-2 rounded-lg p-2 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-muted-foreground text-xs">Antes</dt>
                          <dd>
                            {event.before
                              ? valueLabel(event.before, event.kind)
                              : 'Sin dato registrado'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground text-xs">Después</dt>
                          <dd>
                            {event.after
                              ? valueLabel(event.after, event.kind)
                              : 'Sin dato registrado'}
                          </dd>
                        </div>
                      </dl>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <PlatformMessage
                title={
                  search.accion
                    ? 'No hay actividad de este tipo.'
                    : 'Todavía no hay actividad registrada.'
                }
              >
                {search.accion
                  ? 'Prueba con otro tipo de acción.'
                  : 'Aquí aparecerán los cambios de administración.'}
              </PlatformMessage>
            )}
            <PlatformPagination
              page={page}
              count={activity.data.rows.length}
              hasMore={page < maxActivityPage && activity.data.hasMore}
              onChange={(next) =>
                void navigate({ search: activitySearch(company, search.accion, next) })
              }
            />
          </>
        )}
      </section>
    </PageStack>
  )
}
