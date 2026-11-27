import { Alert, AlertAction, AlertTitle, Button, FormFeedback, Spinner } from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { formatEuros } from '@/shared/domain/money'
import { useActionLock } from '@/shared/lib/use-action-lock'

import {
  moduleCatalogQuery,
  moduleSubscriptionsQuery,
  scheduleModule,
  setTenantModuleGift,
  tenantModulesQuery,
} from '../application/module-queries'
import {
  isModuleIncludedInPlan,
  modules,
  type ModuleCode,
  type ModuleRate,
  type ModuleSubscription,
} from '../domain/modules'

type Selection = { rate: ModuleRate; enabled: boolean; undo: boolean }
type GiftSelection = { code: ModuleCode; gifted: boolean }
type ModuleNavigation =
  | {
      renderRow: (summary: {
        code: ModuleCode
        name: string
        status: string
        surcharge: string
      }) => ReactNode
    }
  | { code: ModuleCode; editing: boolean; editLink: ReactNode }

type ModulePeriod = 'month' | 'year'
type ModulePrice = Pick<ModuleRate, 'monthly_cents' | 'yearly_cents'>

function price({ monthly_cents, yearly_cents }: ModulePrice, period?: ModulePeriod) {
  if (period === 'month') return `+${formatEuros(monthly_cents)}/mes, sin IVA.`
  if (period === 'year') return `+${formatEuros(yearly_cents)}/año, sin IVA.`
  return `+${formatEuros(monthly_cents)}/mes o +${formatEuros(yearly_cents)}/año, sin IVA.`
}

function changeFor(rate: ModuleRate, subscription: ModuleSubscription | undefined): Selection {
  const enabled = subscription?.enabled ?? false
  const undo = subscription?.next_enabled != null
  return { rate, enabled: undo ? enabled : !enabled, undo }
}

export function ModuleSubscriptions({
  tenantId,
  active,
  courtesy = false,
  blocked = false,
  period,
  plan,
  nextPlan,
  allowIncludedSelection = false,
  canGift = false,
  onChanged,
  navigation,
}: {
  tenantId: string
  active: boolean
  courtesy?: boolean
  blocked?: boolean
  period?: ModulePeriod | undefined
  plan?: string | undefined
  nextPlan?: string | null | undefined
  allowIncludedSelection?: boolean
  canGift?: boolean
  onChanged: () => void | Promise<unknown>
  navigation?: ModuleNavigation
}) {
  const catalog = useQuery(moduleCatalogQuery)
  const subscriptions = useQuery(moduleSubscriptionsQuery(tenantId))
  const client = useQueryClient()
  const [selection, setSelection] = useState<Selection | null>(null)
  const [giftSelection, setGiftSelection] = useState<GiftSelection | null>(null)
  const changeLock = useActionLock()
  const giftLock = useActionLock()
  const change = useMutation({
    mutationFn: ({ rate, enabled }: Selection) => scheduleModule(tenantId, rate, enabled),
    onSuccess: async () => {
      setSelection(null)
      await Promise.all([
        client.invalidateQueries({ queryKey: moduleSubscriptionsQuery(tenantId).queryKey }),
        client.invalidateQueries({ queryKey: tenantModulesQuery(tenantId).queryKey }),
        onChanged(),
      ])
    },
    onError: () => client.invalidateQueries({ queryKey: moduleCatalogQuery.queryKey }),
    onSettled: () => {
      changeLock.release()
    },
  })
  const gift = useMutation({
    mutationFn: (change: GiftSelection) =>
      setTenantModuleGift(tenantId, change.code, change.gifted),
    onSuccess: async () => {
      setGiftSelection(null)
      await Promise.all([
        client.invalidateQueries({ queryKey: moduleSubscriptionsQuery(tenantId).queryKey }),
        client.invalidateQueries({ queryKey: tenantModulesQuery(tenantId).queryKey }),
        onChanged(),
      ])
    },
    onSettled: () => {
      giftLock.release()
    },
  })
  const timing = active ? 'en la próxima renovación' : 'al pagar la primera cuota'
  const detail = navigation && 'code' in navigation ? navigation : undefined
  const listing = navigation && 'renderRow' in navigation ? navigation : undefined
  const ready = catalog.isSuccess && subscriptions.isSuccess
  const rates = catalog.data?.filter((rate) => !detail || rate.code === detail.code) ?? []
  const findSubscription = (code: ModuleCode) =>
    subscriptions.data?.find((item) => item.module_code === code)
  const detailIncluded =
    detail !== undefined &&
    (isModuleIncludedInPlan(detail.code, plan ?? '') ||
      (nextPlan != null && isModuleIncludedInPlan(detail.code, nextPlan)))
  const rateToEdit =
    detail?.editing &&
    !detailIncluded &&
    !findSubscription(detail.code)?.gifted &&
    !change.isSuccess &&
    !blocked &&
    ready
      ? rates[0]
      : undefined
  const confirmation = change.isPending
    ? change.variables
    : rateToEdit
      ? changeFor(rateToEdit, findSubscription(rateToEdit.code))
      : selection

  return (
    <section
      aria-label="Módulos opcionales"
      className={
        navigation
          ? 'border-border bg-card space-y-3 overflow-hidden rounded-lg border p-3'
          : 'border-border space-y-3 rounded-lg border p-4'
      }
    >
      <h3 className="text-sm font-semibold">
        {detail ? modules[detail.code].name : 'Módulos opcionales'}
      </h3>
      <p className="text-muted-foreground text-sm">
        {courtesy
          ? 'Los cambios de cortesía son inmediatos y no generan cobros.'
          : `El suplemento se añade a la cuota de la empresa. El acceso cambia ${timing}, tras confirmar el pago. No se borran datos.`}
      </p>
      {blocked ? (
        <Alert variant="warning">
          <AlertTitle>Resuelve primero la cancelación o el pago pendiente.</AlertTitle>
        </Alert>
      ) : null}
      {catalog.isPending || subscriptions.isPending ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Spinner size="sm" label="Cargando módulos…" />
          <span aria-hidden="true">Cargando módulos…</span>
        </div>
      ) : null}
      {catalog.isError || subscriptions.isError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudieron consultar los módulos.</AlertTitle>
          <AlertAction>
            <Button
              size="xs"
              variant="outline"
              onPress={() => void Promise.all([catalog.refetch(), subscriptions.refetch()])}
            >
              Reintentar
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
      {change.error ? (
        <Alert variant="destructive">
          <AlertTitle>{change.error.message}</AlertTitle>
        </Alert>
      ) : null}
      {gift.error ? (
        <Alert variant="destructive">
          <AlertTitle>{gift.error.message}</AlertTitle>
        </Alert>
      ) : null}
      {change.isSuccess ? (
        <FormFeedback
          state={{
            status: 'success',
            message: courtesy
              ? 'Acceso actualizado.'
              : 'Cambio guardado. No se ha realizado ningún cobro.',
          }}
          className="h-auto"
        />
      ) : null}
      {ready && rates.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {detail
            ? 'Este módulo no está disponible para gestionar.'
            : 'No hay módulos opcionales disponibles.'}
        </p>
      ) : null}
      {ready && rates.length > 0 ? (
        <ul
          className={
            listing ? 'divide-border border-border -mx-3 -mb-3 divide-y border-t' : 'space-y-3'
          }
        >
          {rates.map((rate) => {
            const item = findSubscription(rate.code)
            const enabled = item?.enabled ?? false
            const pending = item?.next_enabled ?? null
            const module = modules[rate.code]
            const included = isModuleIncludedInPlan(rate.code, plan ?? '')
            const includedNext =
              !included && nextPlan != null && isModuleIncludedInPlan(rate.code, nextPlan)
            const gifted = item?.gifted ?? false
            const selectForStandard = allowIncludedSelection && included && !gifted && !includedNext
            const action = pending !== null ? 'Deshacer cambio' : enabled ? 'Desactivar' : 'Activar'
            const actionLabel =
              selectForStandard && !enabled && pending === null ? 'Contratar para Ábaco' : action
            const modulePrice = item && (enabled || pending === true) ? item : rate
            const surcharge =
              courtesy ||
              gifted ||
              included ||
              includedNext ||
              (modulePrice.monthly_cents === 0 && modulePrice.yearly_cents === 0)
                ? 'Sin suplemento.'
                : price(modulePrice, period)
            const status = gifted
              ? 'Regalado'
              : included
                ? 'Incluido en el plan'
                : includedNext
                  ? 'Incluido en el próximo plan'
                  : enabled
                    ? 'Activo'
                    : 'Inactivo'
            const scheduled =
              pending === null ? null : pending ? 'Alta programada' : 'Baja programada'
            if (listing)
              return (
                <li key={rate.code}>
                  {listing.renderRow({
                    code: rate.code,
                    name: module.name,
                    status: scheduled ? `${status} · ${scheduled}` : status,
                    surcharge,
                  })}
                </li>
              )
            return (
              <li
                key={rate.code}
                className="flex flex-wrap items-center justify-between gap-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {detail ? `Acceso: ${status.toLowerCase()}` : `${module.name} · ${status}`}
                  </p>
                  <p className="text-muted-foreground">{module.description}</p>
                  <p>{surcharge}</p>
                  {selectForStandard ? (
                    <p className="text-muted-foreground">
                      Para conservarlo con la nueva tarifa, contrátalo como módulo opcional.{' '}
                      {price(modulePrice, period)}
                    </p>
                  ) : null}
                  {scheduled ? <p>{scheduled}.</p> : null}
                </div>
                {detail && !detail.editing && !blocked ? detail.editLink : null}
                {!detail && (!included || selectForStandard) && !includedNext && !gifted ? (
                  <Button
                    variant="outline"
                    aria-label={`${actionLabel}: ${module.name}`}
                    isDisabled={blocked || change.isPending || Boolean(selection)}
                    onPress={() => {
                      change.reset()
                      setSelection(changeFor(rate, item))
                    }}
                  >
                    {actionLabel}
                  </Button>
                ) : null}
                {canGift && detail?.editing ? (
                  <Button
                    variant="outline"
                    aria-label={`${gifted ? 'Retirar regalo' : 'Regalar'}: ${module.name}`}
                    isDisabled={blocked || gift.isPending || Boolean(giftSelection)}
                    onPress={() => {
                      gift.reset()
                      setGiftSelection({ code: rate.code, gifted: !gifted })
                    }}
                  >
                    {gifted ? 'Retirar regalo' : 'Regalar módulo'}
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      {confirmation ? (
        <div className="border-border space-y-2 border-t pt-3 text-sm" aria-live="polite">
          <p>
            {confirmation.undo
              ? 'Deshacer el cambio de'
              : confirmation.enabled
                ? 'Activar'
                : 'Desactivar'}{' '}
            {modules[confirmation.rate.code].name}.
            {!courtesy && !confirmation.undo && confirmation.enabled
              ? ` ${price(confirmation.rate, period)}`
              : null}
          </p>
          <div className="flex gap-2">
            <Button
              isDisabled={blocked || change.isPending}
              onPress={() => {
                if (!changeLock.acquire()) return
                change.mutate(confirmation)
              }}
            >
              {change.isPending ? 'Guardando…' : detail ? 'Guardar cambio' : 'Confirmar módulo'}
            </Button>
            {!detail ? (
              <Button
                variant="outline"
                isDisabled={change.isPending}
                onPress={() => setSelection(null)}
              >
                Volver
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {gift.isSuccess ? (
        <FormFeedback
          state={{
            status: 'success',
            message: 'Regalo actualizado. No se ha realizado ningún cobro.',
          }}
          className="h-auto"
        />
      ) : null}
      {giftSelection ? (
        <div className="border-border space-y-2 border-t pt-3 text-sm" aria-live="polite">
          <p>
            {giftSelection.gifted ? 'Regalar' : 'Retirar el regalo de'}{' '}
            {modules[giftSelection.code].name}. El cambio de acceso es inmediato y no realiza
            cargos.
          </p>
          <div className="flex gap-2">
            <Button
              isDisabled={blocked || gift.isPending}
              onPress={() => {
                if (!giftLock.acquire()) return
                gift.mutate(giftSelection)
              }}
            >
              {gift.isPending ? 'Guardando…' : 'Confirmar regalo'}
            </Button>
            <Button
              variant="outline"
              isDisabled={gift.isPending}
              onPress={() => setGiftSelection(null)}
            >
              Volver
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
