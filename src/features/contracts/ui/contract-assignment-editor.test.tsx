import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  initialContractAssignments,
  type ContractSignatureSetup,
} from '../domain/contract-task-assignment'
import { ContractAssignmentEditor } from './contract-assignment-editor'

type SelectProps = {
  label: string
  value: string
  isDisabled: boolean
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}
const mocks = vi.hoisted(() => ({ controls: [] as SelectProps[] }))
vi.mock('@/features/auth', () => ({
  UserAvatar: ({ name }: { name: string }) => <span>{name}</span>,
}))
vi.mock('@/shared/ui/form', () => ({
  SelectField: (props: SelectProps) => {
    mocks.controls.push(props)
    return <span>{props.label}</span>
  },
}))

const setup: ContractSignatureSetup = {
  updated_at: 'v1',
  jobs: [{ id: 'j1', title: 'Limpieza general', assigned_user_id: 'p1', work_team_id: null }],
  tasks: [
    {
      task_key: 'service:s1:r1',
      title: 'Cristales',
      section_title: 'Servicios',
      frequency: 'Cada lunes',
      notes: 'Hasta el segundo piso',
      periodicities: ['weekly'],
    },
  ],
  assignments: [],
  people: [
    { id: 'p1', label: 'Ana' },
    { id: 'p2', label: 'Pol' },
  ],
  teams: [{ id: 't1', name: 'Brigada' }],
}

describe('contract assignment controls', () => {
  beforeEach(() => {
    mocks.controls = []
  })

  it('shows accepted scope and permits task-specific people rather than only job ownership', () => {
    let drafts = initialContractAssignments(setup)
    const render = () => {
      mocks.controls = []
      return renderToStaticMarkup(
        <ContractAssignmentEditor
          setup={setup}
          drafts={drafts}
          disabled={false}
          onChange={(next) => {
            drafts = next
          }}
        />,
      )
    }
    const html = render()
    for (const text of ['Cristales', 'Semanal', 'Cada lunes', 'Hasta el segundo piso'])
      expect(html).toContain(text)
    const mode = mocks.controls.filter((control) => control.label === 'Asignar a').at(-1)
    expect(mode?.options.map((option) => option.value)).toEqual(['inherit', 'people', 'team'])
    mode?.onChange('people')
    const peopleHtml = render()
    for (const text of ['Personas asignadas', 'Ana', 'Pol']) expect(peopleHtml).toContain(text)
    expect(drafts[1]?.mode).toBe('people')
    mocks.controls
      .filter((control) => control.label === 'Asignar a')
      .at(-1)
      ?.onChange('team')
    render()
    mocks.controls.find((control) => control.label === 'Equipo')?.onChange('t1')
    expect(drafts[1]).toMatchObject({ mode: 'team', team_id: 't1', user_ids: [] })
  })

  it('keeps job ownership in the contract rather than editing it at signing', () => {
    const html = renderToStaticMarkup(
      <ContractAssignmentEditor
        setup={setup}
        drafts={initialContractAssignments(setup)}
        disabled={false}
        onChange={vi.fn()}
      />,
    )
    expect(html).toContain('Todos los trabajos comparten los responsables')
    expect(mocks.controls.filter((control) => control.label === 'Asignar a')).toHaveLength(1)
  })

  it('disables all selects while saving, including controls rendered in portals', () => {
    renderToStaticMarkup(
      <ContractAssignmentEditor
        setup={setup}
        drafts={initialContractAssignments(setup)}
        disabled
        onChange={vi.fn()}
      />,
    )
    expect(mocks.controls.length).toBeGreaterThan(0)
    expect(mocks.controls.every((control) => control.isDisabled)).toBe(true)
  })
})
