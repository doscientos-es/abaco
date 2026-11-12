import { describe, expect, it } from 'vitest'

import type { WorkStructure } from '@/features/work-orders/infrastructure/work-structure-repository'

import { mapWorkStructureToMyDayTasks } from './my-day-tasks'

describe('mapWorkStructureToMyDayTasks', () => {
  it('groups the service checklist under its task and keeps the task status', () => {
    const structure: WorkStructure = {
      phases: [{ id: 'phase-1', position: 1, title: 'Revisión' }],
      tasks: [
        {
          id: 'task-1',
          phase_id: 'phase-1',
          position: 1,
          title: 'Revisar bomba',
          notes: 'Comprobar presión',
          status: 'in_progress',
          updated_at: '2026-11-12T09:00:00.000Z',
        },
      ],
      items: [
        {
          id: 'item-1',
          task_id: 'task-1',
          position: 1,
          label: 'Medir presión',
          done: true,
          updated_at: '2026-11-12T09:00:00.000Z',
        },
      ],
    }

    expect(mapWorkStructureToMyDayTasks(structure)).toEqual([
      {
        ...structure.tasks[0],
        phaseTitle: 'Revisión',
        checklist: [{ id: 'item-1', label: 'Medir presión', done: true }],
      },
    ])
  })

  it('shows a fallback phase and an empty checklist when the structure has none', () => {
    const structure: WorkStructure = {
      phases: [],
      tasks: [
        {
          id: 'task-2',
          phase_id: 'missing-phase',
          position: 1,
          title: 'Limpiar filtro',
          notes: '',
          status: 'pending',
          updated_at: '2026-11-12T09:00:00.000Z',
        },
      ],
      items: [],
    }

    expect(mapWorkStructureToMyDayTasks(structure)[0]).toMatchObject({
      phaseTitle: 'Tareas del servicio',
      checklist: [],
    })
  })
})
