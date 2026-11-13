import { Link } from '@tanstack/react-router'

import type { WorkersSearch, WorkerView } from '../domain/worker-navigation'

const labels: Record<WorkerView, string> = {
  personas: 'Personas',
  equipos: 'Equipos',
  horarios: 'Horarios',
  vacaciones: 'Vacaciones',
  organigrama: 'Organigrama',
  funciones: 'Funciones',
}

export function WorkersNavigation({
  search,
  view,
  scoped,
}: {
  search: WorkersSearch
  view: WorkerView
  scoped: boolean
}) {
  const views: WorkerView[] = scoped
    ? ['personas', 'horarios', 'vacaciones']
    : ['personas', 'equipos', 'horarios', 'vacaciones', 'organigrama', 'funciones']
  return (
    <nav
      aria-label={scoped ? 'Secciones de la ficha' : 'Secciones de trabajadores'}
      className="flex gap-1"
    >
      {views.map((id) => (
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
