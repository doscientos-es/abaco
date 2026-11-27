import { Buildings, CaretDown, Sparkle, UsersThree } from '@phosphor-icons/react'

import { formatEuros } from '@/features/billing'
import { modules, type ModuleRate } from '@/features/product-modules'

import type { OfferModule } from '../domain/offer'

const content = {
  workers: {
    icon: UsersThree,
    value: 'Organiza a tu equipo, sin cuadrar horarios en hojas sueltas.',
    features: [
      'Importar personas desde Excel o CSV',
      'Funciones y horarios',
      'Documentos y solicitudes de vacaciones',
    ],
    example:
      'Importa tu equipo y distingue a quienes necesitan acceso de las personas que solo quieres registrar.',
  },
  procurement: {
    icon: Buildings,
    value: 'Prepara el material de cada trabajo y detecta qué te falta.',
    features: ['Fichas de proveedores', 'Stock y faltantes', 'Preparación de pedidos de material'],
    example: 'Revisa qué productos tienes disponibles antes de confirmar una intervención.',
  },
  ai: {
    icon: Sparkle,
    value: 'Empieza con un borrador de presupuesto y revisa antes de enviarlo.',
    features: [
      'Sugerencias para presupuestos',
      'Cuenta de la persona administradora',
      '500 peticiones incluidas al mes',
    ],
    example:
      'Describe el encargo, revisa las partidas sugeridas y ajusta los importes. Nada se envía sin tu revisión.',
  },
} satisfies Record<
  OfferModule,
  { icon: typeof UsersThree; value: string; features: string[]; example: string }
>

export function ModuleCards({
  offers,
  selected,
  toggle,
}: {
  offers: (ModuleRate & { code: OfferModule })[]
  selected: readonly OfferModule[]
  toggle: (code: OfferModule) => void
}) {
  return (
    <div className="grid items-start gap-4 sm:grid-cols-2">
      {offers.map(({ code, monthly_cents, yearly_cents }) => {
        const item = content[code]
        const selectedModule = selected.includes(code)
        const Icon = item.icon
        return (
          <article
            key={code}
            data-selected={selectedModule ? 'true' : undefined}
            className="flow-panel p-4 transition-colors motion-reduce:transition-none sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-primary grid size-11 place-items-center rounded-xl bg-[#e8f2db]">
                <Icon size={22} aria-hidden="true" />
              </span>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#dae5d3] bg-white px-3 py-2 text-sm font-bold">
                <input
                  type="checkbox"
                  className="accent-primary size-4"
                  aria-label={`Añadir ${modules[code].name}`}
                  checked={selectedModule}
                  onChange={() => toggle(code)}
                />
                {selectedModule ? 'Añadido' : 'Añadir'}
              </label>
            </div>
            <h2 className="mt-3 text-lg font-semibold">{modules[code].name}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{item.value}</p>
            <p className="mt-3 text-sm font-medium">
              +{formatEuros(monthly_cents / 100)}/mes{' '}
              <span className="text-muted-foreground">o</span> +{formatEuros(yearly_cents / 100)}
              /año
            </p>
            <p className="text-muted-foreground text-xs">
              Sin IVA, {code === 'ai' ? 'por usuario (una licencia)' : 'por empresa'}.
            </p>
            <details className="group border-border mt-4 border-t pt-2 text-sm">
              <summary className="text-primary flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-md font-semibold [&::-webkit-details-marker]:hidden">
                Ver qué incluye
                <CaretDown
                  className="transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <ul className="my-3 list-disc space-y-1 pl-5">
                {item.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <p className="text-muted-foreground">{item.example}</p>
              <figure className="mt-3">
                <img
                  src={`/onboarding/${code}.webp`}
                  alt={`Captura de ${modules[code].name} con datos de ejemplo`}
                  width={880}
                  height={512}
                  loading="lazy"
                  className="border-border w-full rounded-xl border"
                />
                <figcaption className="text-muted-foreground mt-1 text-xs">
                  Captura de Menos Líos con datos ficticios.
                </figcaption>
              </figure>
            </details>
          </article>
        )
      })}
    </div>
  )
}
