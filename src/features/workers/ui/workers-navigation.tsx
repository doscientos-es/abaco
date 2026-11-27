import { Link } from '@tanstack/react-router'

import type { WorkersSearch, WorkerView } from '../domain/worker-navigation'

const labels: Record<WorkerView, string> = {
  personas: 'Personas',
  equipos: 'Equipos',
  calendario: 'Calendario',
  horarios: 'Horarios',
  vacaciones: 'Vacaciones',
  funciones: 'Funciones',
  documentos: 'Documentos',
}

export function WorkersNavigation({
  search,
  view,
  scoped,
  showDocuments,
  showCalendar = true,
}: {
  search: WorkersSearch
  view: WorkerView
  scoped: boolean
  showDocuments: boolean
  showCalendar?: boolean
}) {
  const views: WorkerView[] = scoped
    ? [
        'personas',
        'calendario',
        'horarios',
        'vacaciones',
        ...(showDocuments ? (['documentos'] as const) : []),
      ]
    : ['personas', 'equipos', 'calendario', 'horarios', 'vacaciones', 'funciones']
  return (
    <nav
      aria-label={scoped ? 'Secciones de la ficha' : 'Secciones de trabajadores'}
      className="flex gap-1"
    >
      {views
        .filter((id) => showCalendar || id !== 'calendario')
        .map((id) => (
          <Link
            key={id}
            to="/trabajadores"
            search={{ ...search, vista: id }}
            aria-current={view === id ? 'page' : undefined}
            className="hover:bg-muted hover:text-foreground"
          >
            {id === 'personas' && search.persona ? 'Ficha' : labels[id]}
          </Link>
        ))}
    </nav>
  )
}
