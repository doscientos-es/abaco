import { FileText, House, Plus, UsersThree } from '@phosphor-icons/react'

import { brandThemeStyle, defaultBrandColor } from '@/shared/ui/brand-theme'

const navigation = [
  { label: 'Resumen', Icon: House },
  { label: 'Presupuestos', Icon: FileText },
  { label: 'Clientes', Icon: UsersThree },
] as const

const metrics = [
  { label: 'Presupuestos abiertos', amount: '8' },
  { label: 'Facturado este mes', amount: '4.820,00 €' },
] as const

export function BrandPreview({
  companyName,
  color,
  logoUrl,
}: {
  companyName: string
  color: string
  logoUrl: string
}) {
  const theme = brandThemeStyle(color) ?? brandThemeStyle(defaultBrandColor)
  return (
    <div
      className="border-border bg-muted/70 @container/brand rounded-xl border p-3 sm:p-5"
      style={theme}
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Así se verá tu espacio de trabajo</h2>
        </div>
        <span className="border-border bg-card rounded-full border px-2.5 py-1 text-xs">
          Datos de muestra
        </span>
      </header>
      <div className="border-border bg-card grid overflow-hidden rounded-xl border shadow-sm @min-[31rem]/brand:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="border-border min-w-0 border-b p-3 @min-[31rem]/brand:border-r @min-[31rem]/brand:border-b-0">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="bg-primary text-primary-foreground relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg text-xs font-semibold"
              aria-hidden="true"
            >
              {companyName.slice(0, 2).toLocaleUpperCase('es')}
              {logoUrl ? (
                <img
                  key={logoUrl}
                  src={logoUrl}
                  alt=""
                  className="bg-card absolute inset-0 block size-full object-contain p-0.5"
                  onError={(event) => {
                    event.currentTarget.hidden = true
                  }}
                />
              ) : null}
            </span>
            <span className="min-w-0 text-sm leading-tight font-semibold wrap-anywhere">
              {companyName}
            </span>
          </div>
          <ul
            className="mt-4 flex flex-wrap gap-1 @min-[31rem]/brand:grid"
            aria-label="Navegación de ejemplo"
          >
            {navigation.map(({ label, Icon }, index) => (
              <li
                key={label}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs ${index === 0 ? 'bg-primary/10 border-primary border-l-2 font-semibold' : 'text-muted-foreground'}`}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-background min-w-0 space-y-4 p-3 @min-[31rem]/brand:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Resumen</h3>
            <span className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold">
              <Plus className="size-3.5" aria-hidden="true" /> Nuevo presupuesto
            </span>
          </div>
          <dl className="grid gap-2 @min-[23rem]/brand:grid-cols-2">
            {metrics.map(({ label, amount }) => (
              <div key={label} className="bg-card border-border rounded-lg border p-3">
                <dt className="text-muted-foreground text-xs">{label}</dt>
                <dd className="mt-1 font-semibold tabular-nums">{amount}</dd>
              </div>
            ))}
          </dl>
          <div className="bg-card border-border rounded-lg border p-3">
            <p className="mb-2 text-xs font-semibold">Actividad reciente</p>
            <div className="border-border flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs">
              <span>Presupuesto DEMO-001</span>
              <span className="bg-primary/10 flex items-center gap-1.5 rounded-full px-2 py-1 font-medium">
                <span className="bg-primary size-1.5 rounded-full" aria-hidden="true" /> Enviado
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="border-border bg-card mt-4 flex items-center gap-3 rounded-lg border p-3 text-xs">
        <span
          className="bg-primary border-border size-6 shrink-0 rounded-md border"
          aria-hidden="true"
        />
        <span className="font-medium">Color principal</span>
        <span className="text-muted-foreground font-mono">
          {theme?.['--primary'].toUpperCase()}
        </span>
      </div>
    </div>
  )
}
