import {
  Button,
  DataViewState,
  DataViewStateActions,
  DataViewStateDescription,
  DataViewStateTitle,
  ErrorState,
  ErrorStateActions,
  ErrorStateDescription,
  ErrorStateIcon,
  ErrorStateTitle,
  Skeleton,
  Spinner,
} from '@doscientos/ui'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

/** Shown while a page is loading: mimics the layout (title, 4 cards, 2 panels) so nothing jumps. */
export function PageLoading() {
  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Spinner label="Preparando tu espacio…" size="sm" />
        <span aria-hidden="true">Preparando tu espacio…</span>
      </div>
      <div className="space-y-2" aria-hidden="true">
        <Skeleton className="h-7 w-40 max-w-full" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 rounded-xl sm:h-20" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-5" aria-hidden="true">
        <Skeleton className="h-44 rounded-xl sm:h-64 lg:col-span-3" />
        <Skeleton className="hidden h-64 rounded-xl sm:block lg:col-span-2" />
      </div>
    </div>
  )
}

/** Friendly error for a whole page. Explains what to do in plain words. */
export function PageError({ reset }: { reset?: () => void }) {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  return (
    <ErrorState className="mx-auto mt-8 max-w-lg py-10">
      <ErrorStateIcon className="size-8" />
      <ErrorStateTitle>{offline ? 'Sin conexión' : 'Algo no ha ido bien'}</ErrorStateTitle>
      <ErrorStateDescription>
        {offline
          ? 'Esta pantalla necesita datos o una sesión que aún no se han cargado. Conéctate y vuelve a intentarlo.'
          : 'No hemos podido mostrar esta pantalla. Prueba a intentarlo de nuevo o vuelve al inicio.'}
      </ErrorStateDescription>
      <ErrorStateActions>
        {reset ? <Button onPress={reset}>Intentarlo de nuevo</Button> : null}
        <Button variant="outline" onPress={() => window.location.assign('/')}>
          Ir al inicio
        </Button>
      </ErrorStateActions>
    </ErrorState>
  )
}

/** Empty list: big icon, plain explanation and one clear next step (a button). */
export function EmptyPanel({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <DataViewState className="border-dashed px-4 py-8 sm:py-10">
      <span
        aria-hidden="true"
        className="bg-secondary text-muted-foreground flex size-12 items-center justify-center rounded-full [&>svg]:size-6"
      >
        {icon}
      </span>
      <DataViewStateTitle>{title}</DataViewStateTitle>
      <DataViewStateDescription className="max-w-sm">{description}</DataViewStateDescription>
      {children ? <DataViewStateActions>{children}</DataViewStateActions> : null}
    </DataViewState>
  )
}

/** Friendly "not found" for pages and for records (e.g. a deleted estimate). */
export function PageNotFound({
  title = 'No encontramos esta página',
  description = 'Puede que el enlace sea antiguo o que se haya borrado.',
  backTo = '/',
  backLabel = 'Volver al inicio',
}: {
  title?: string
  description?: string
  backTo?: '/' | '/presupuestos' | '/clientes' | '/facturas' | '/trabajos'
  backLabel?: string
}) {
  return (
    <DataViewState className="mx-auto mt-8 max-w-lg py-10">
      <DataViewStateTitle>{title}</DataViewStateTitle>
      <DataViewStateDescription>{description}</DataViewStateDescription>
      <DataViewStateActions>
        <Link
          to={backTo}
          className="text-primary text-sm font-medium underline-offset-4 hover:underline"
        >
          {backLabel}
        </Link>
      </DataViewStateActions>
    </DataViewState>
  )
}
