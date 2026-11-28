import type { AssignedCentreProtocol } from '../domain/centre-protocol'

export function WorkerCentreProtocol({
  protocol,
}: {
  protocol: AssignedCentreProtocol | undefined
}) {
  if (!protocol) return null
  const changed = new Set(protocol.changed_items)
  const summary = {
    no_baseline: 'No hay una visita anterior verificable para comparar.',
    new: 'Nuevo desde tu última visita registrada.',
    unchanged: 'Sin cambios desde tu última visita registrada.',
    changed: 'Cambió desde tu última visita registrada.',
  }[protocol.state]
  return (
    <section
      aria-label="Protocolo del centro"
      className="border-primary/40 bg-primary/5 min-w-0 space-y-2 rounded-lg border p-3"
    >
      <h4 className="font-semibold">Protocolo del centro</h4>
      <p className="text-muted-foreground text-xs">{summary}</p>
      <ol className="list-decimal space-y-1.5 ps-5 text-sm">
        {protocol.items.map((item) => (
          <li key={item} className="wrap-break-word">
            {item}
            {changed.has(item) ? (
              <span className="bg-primary/10 text-primary ms-1.5 inline-block rounded px-1.5 py-0.5 text-xs font-semibold">
                Nueva indicación
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      {protocol.removed_count ? (
        <p className="text-muted-foreground text-xs">
          {protocol.removed_count === 1
            ? 'Se retiró una indicación anterior.'
            : `Se retiraron ${protocol.removed_count} indicaciones anteriores.`}
        </p>
      ) : null}
    </section>
  )
}
