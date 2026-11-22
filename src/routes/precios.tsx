import { createFileRoute, Link } from '@tanstack/react-router'

import { PricingCatalog, TRIAL_DAYS } from '@/features/billing'

export const Route = createFileRoute('/precios')({ component: PricingPage })

function PricingPage() {
  const { session } = Route.useRouteContext()
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-8">
      <header className="space-y-4">
        <p className="text-primary text-sm font-semibold">Ábaco</p>
        <h1 className="text-3xl font-semibold">Una tarifa que crece con tu equipo</h1>
        <p className="text-muted-foreground max-w-2xl">
          Envía presupuestos, recibe la respuesta de tus clientes y controla lo que te queda por
          cobrar.
        </p>
        <p className="text-sm">{TRIAL_DAYS} días de prueba, sin tarjeta ni cobro automático.</p>
        <div className="flex flex-wrap gap-4">
          {session?.role === 'admin' ? (
            <Link
              className="text-primary font-medium underline"
              to="/ajustes"
              search={{ tab: 'plan' }}
            >
              Abrir plan y facturación
            </Link>
          ) : !session ? (
            <>
              <Link className="text-primary font-medium underline" to="/registro">
                Empezar prueba gratis
              </Link>
              <Link className="text-muted-foreground underline" to="/entrar">
                Ya tengo cuenta
              </Link>
            </>
          ) : (
            <Link className="text-primary font-medium underline" to="/">
              Volver a Ábaco
            </Link>
          )}
        </div>
      </header>
      <PricingCatalog />
      <p className="text-muted-foreground text-sm">
        Pago con tarjeta, renovación automática y sin permanencia: puedes cancelar al final del
        periodo pagado.
      </p>
    </main>
  )
}
