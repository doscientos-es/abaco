import type { PortalContent, PortalDocument, PortalVisit } from '../domain/customer-portal'

import './customer-portal-content.css'

export function formatPortalDate(value: string, timezone = 'Europe/Madrid') {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value))
}

export function portalVisitRange(visit: PortalVisit) {
  const value = (stamp: string) => formatPortalDate(stamp, visit.timezone)
  return `${value(visit.startsAt)} → ${value(visit.endsAt)} · ${visit.timezone}`
}

function ServiceSummary({ document }: { document: PortalDocument }) {
  return (
    <details className="ml-portal-document">
      <summary>
        Resumen de servicio · versión {document.version}
        <span>{formatPortalDate(document.closedAt)} · hora peninsular</span>
      </summary>
      {document.checksTotal ? (
        <p>
          Comprobaciones completadas: {document.checksDone} de {document.checksTotal}.
        </p>
      ) : (
        <p>Esta versión no incluye comprobaciones.</p>
      )}
      <p>Es un resumen de la versión cerrada, no el parte de trabajo completo.</p>
    </details>
  )
}

export function CustomerPortalContent({ visits, documents }: PortalContent) {
  return (
    <div className="ml-portal-content">
      <section aria-label="Próximas visitas">
        <h2>Próximas visitas</h2>
        {visits.length === 0 ? (
          <p className="ml-portal-muted">
            No hay visitas próximas o en curso compartidas en este enlace.
          </p>
        ) : (
          <ul>
            {visits.map((visit, index) => (
              <li key={`${visit.startsAt}:${visit.endsAt}:${index}`} className="ml-portal-visit">
                <strong>{visit.status === 'in_progress' ? 'En curso' : 'Planificada'}</strong>
                <span>{portalVisitRange(visit)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Documentos compartidos">
        <h2>Documentos compartidos</h2>
        {documents.length === 0 ? (
          <p className="ml-portal-muted">No se han compartido documentos en este enlace.</p>
        ) : (
          <ul>
            {documents.map((document, index) => (
              <li key={`${document.closedAt}:${document.version}:${index}`}>
                <ServiceSummary document={document} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
