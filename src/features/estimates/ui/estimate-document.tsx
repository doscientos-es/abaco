import { calculateTotals, milestoneAmounts } from '@/shared/domain/estimate'
import { formatEuros, lineTotal } from '@/shared/domain/money'
import type { Client, Estimate, Tenant } from '@/shared/domain/types'

/** Client-facing proposal. Rendered on screen and printed/saved as PDF via the browser. */
export function EstimateDocument({
  estimate,
  client,
  tenant,
}: {
  estimate: Estimate
  client: Client | undefined
  tenant: Tenant
}) {
  const totals = calculateTotals(estimate.lines, estimate.vatRate)
  const milestones = milestoneAmounts(estimate.milestones, totals.totalCents)

  return (
    <article className="estimate-document bg-card mx-auto max-w-3xl space-y-8 rounded-lg border p-4 text-sm sm:p-8 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:gap-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{tenant.name}</h2>
          <p className="text-muted-foreground">
            {tenant.taxId} · {tenant.phone} · {tenant.email}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-lg font-semibold">Presupuesto {estimate.number}</p>
          <p className="text-muted-foreground">Fecha: {estimate.createdAt}</p>
          <p className="text-muted-foreground">Válido hasta: {estimate.validUntil}</p>
        </div>
      </header>

      <section>
        <p className="text-muted-foreground text-xs uppercase tracking-wider">Cliente</p>
        <p className="font-medium">{client?.name ?? 'Sin cliente'}</p>
        <p className="text-muted-foreground">{client?.address}</p>
      </section>

      <section>
        <h3 className="mb-3 text-base font-semibold">{estimate.title}</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-104">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="py-2 font-medium">Concepto</th>
                <th className="py-2 text-right font-medium">Cant.</th>
                <th className="py-2 text-right font-medium">Precio</th>
                <th className="py-2 text-right font-medium">Importe</th>
              </tr>
            </thead>
            <tbody>
              {estimate.lines.map((line) => (
                <tr key={line.id} className="border-b">
                  <td className="py-2">{line.description}</td>
                  <td className="py-2 text-right tabular-nums">
                    {line.quantity} {line.unit}
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatEuros(line.unitPriceCents)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatEuros(lineTotal(line.quantity, line.unitPriceCents))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="mt-4 ml-auto w-full space-y-1 tabular-nums sm:w-64">
          <Row label="Materiales" value={totals.materialsCents} />
          <Row label="Mano de obra" value={totals.laborCents} />
          {totals.otherCents > 0 ? <Row label="Otros" value={totals.otherCents} /> : null}
          <Row label="Base imponible" value={totals.subtotalCents} />
          <Row label={`IVA ${estimate.vatRate}%`} value={totals.vatCents} />
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd>{formatEuros(totals.totalCents)}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h3 className="mb-2 text-base font-semibold">Forma de pago</h3>
        <ul className="space-y-1">
          {milestones.map((m) => (
            <li key={m.id} className="flex justify-between tabular-nums">
              <span>
                {m.label} ({m.percent}%)
                {m.description ? (
                  <span className="text-muted-foreground block text-xs">{m.description}</span>
                ) : null}
              </span>
              <span>{formatEuros(m.amountCents)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-base font-semibold">Condiciones</h3>
        <p className="text-muted-foreground whitespace-pre-line">{estimate.clauses}</p>
      </section>

      <footer className="grid grid-cols-2 gap-4 pt-10 sm:gap-10 text-xs">
        <div className="border-t pt-2">Firma de la empresa</div>
        <div className="border-t pt-2">Conforme del cliente</div>
      </footer>
    </article>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{formatEuros(value)}</dd>
    </div>
  )
}
