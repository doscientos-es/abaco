import { IconButton } from '@doscientos/ui'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import type * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TextField } from '@/shared/ui/form'

import type { StaffSelection } from '../domain/staff-selection'
import { StaffPeopleFilter } from './staff-people-filter'

const state = vi.hoisted(() => ({ query: '', limit: 20 }))
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: string | number) =>
    typeof initial === 'string'
      ? [
          state.query,
          (value: string) => {
            state.query = value
          },
        ]
      : [
          state.limit,
          (value: number) => {
            state.limit = value
          },
        ],
}))

type Props = {
  children?: ReactNode
  checked?: boolean
  disabled?: boolean
  type?: string
  'aria-label'?: string
  onChange?: (value: string | { target: { checked: boolean } }) => void
  onPress?: () => void
  label?: string
}

function findAll(
  node: ReactNode,
  predicate: (element: ReactElement<Props>) => boolean,
): ReactElement<Props>[] {
  const found: ReactElement<Props>[] = []
  Children.forEach(node, (child) => {
    if (isValidElement<Props>(child)) {
      if (predicate(child)) found.push(child)
      found.push(...findAll(child.props.children, predicate))
    }
  })
  return found
}

const people = [
  { userId: 'ana', name: 'Ana García', email: 'ana@example.com', schedule: null },
  { userId: 'luis', name: 'Luis', email: 'operations@example.com', schedule: null },
]
const teams = [{ id: 'north', name: 'Equipo norte', memberIds: ['ana', 'luis'] }]
const empty: StaffSelection = { personIds: [], teamIds: [] }

describe('staff people filter', () => {
  beforeEach(() => {
    state.query = ''
    state.limit = 20
  })

  it('does not render the entire workforce before searching', () => {
    const tree = StaffPeopleFilter({
      people,
      teams,
      selected: empty,
      onChange: vi.fn(),
      onEdit: vi.fn(),
    })
    expect(findAll(tree, (node) => node.type === 'input')).toHaveLength(0)
    expect(findAll(tree, (node) => node.type === TextField)).toHaveLength(1)
  })

  it('searches names without accents and emails, and keeps other selections', () => {
    state.query = 'garcia'
    const onChange = vi.fn()
    const render = () =>
      StaffPeopleFilter({
        people,
        teams,
        selected: { personIds: ['luis'], teamIds: [] },
        onChange,
        onEdit: vi.fn(),
      })
    const results = findAll(render(), (node) => node.type === 'input')
    expect(results).toHaveLength(1)
    results[0]?.props.onChange?.({ target: { checked: true } })
    expect(onChange).toHaveBeenLastCalledWith({ personIds: ['luis', 'ana'], teamIds: [] })
    state.query = 'operations'
    expect(findAll(render(), (node) => node.type === IconButton)[0]?.props.label).toBe(
      'Editar horario de Luis',
    )
  })

  it('selects whole teams and makes team-derived people explicit', () => {
    state.query = 'norte'
    const onChange = vi.fn()
    const tree = StaffPeopleFilter({ people, teams, selected: empty, onChange, onEdit: vi.fn() })
    findAll(tree, (node) => node.type === 'input')[0]?.props.onChange?.({
      target: { checked: true },
    })
    expect(onChange).toHaveBeenCalledWith({ personIds: [], teamIds: ['north'] })
    state.query = 'ana'
    const selected = StaffPeopleFilter({
      people,
      teams,
      selected: { personIds: [], teamIds: ['north'] },
      onChange,
      onEdit: vi.fn(),
    })
    const input = findAll(selected, (node) => node.type === 'input')[0]
    expect(input?.props).toMatchObject({ checked: true, disabled: true })
    findAll(
      selected,
      (node) => node.props['aria-label'] === 'Quitar equipo Equipo norte',
    )[0]?.props.onPress?.()
    expect(onChange).toHaveBeenLastCalledWith(empty)
  })

  it('bounds results for 154 employees, loads more, and resets the limit on a new search', () => {
    state.query = 'Persona'
    const workforce = Array.from({ length: 154 }, (_, index) => ({
      userId: String(index),
      name: `Persona ${index}`,
      schedule: null,
    }))
    const render = () =>
      StaffPeopleFilter({
        people: workforce,
        teams: [],
        selected: empty,
        onChange: vi.fn(),
        onEdit: vi.fn(),
      })
    expect(findAll(render(), (node) => node.type === 'input')).toHaveLength(20)
    findAll(
      render(),
      (node) => node.props.children === 'Mostrar más resultados',
    )[0]?.props.onPress?.()
    expect(findAll(render(), (node) => node.type === 'input')).toHaveLength(40)
    findAll(render(), (node) => node.type === TextField)[0]?.props.onChange?.('Persona 153')
    expect(state.limit).toBe(20)
    expect(findAll(render(), (node) => node.type === IconButton)[0]?.props.label).toBe(
      'Editar horario de Persona 153',
    )
  })

  it('clears all selections and opens the editor for a searched person', () => {
    state.query = 'garcia'
    const onEdit = vi.fn()
    const onChange = vi.fn()
    const tree = StaffPeopleFilter({
      people,
      teams,
      selected: { personIds: ['ana'], teamIds: ['north'] },
      onChange,
      onEdit,
    })
    const edit = findAll(
      tree,
      (node) => node.type === IconButton && node.props.label === 'Editar horario de Ana García',
    )[0]
    edit?.props.onPress?.()
    expect(onEdit).toHaveBeenCalledWith('ana')
    findAll(tree, (node) => node.props.children === 'Limpiar selección')[0]?.props.onPress?.()
    expect(onChange).toHaveBeenCalledWith(empty)
  })

  it('allows all employees explicitly without rendering hundreds of selected chips', () => {
    const workforce = Array.from({ length: 150 }, (_, index) => ({
      userId: String(index),
      name: `Persona ${index}`,
      schedule: null,
    }))
    const onChange = vi.fn()
    const tree = StaffPeopleFilter({ people: workforce, teams: [], selected: empty, onChange })
    findAll(tree, (node) => node.props.children === 'Ver todas las personas')[0]?.props.onPress?.()
    expect(onChange.mock.calls[0]?.[0].personIds).toHaveLength(150)
    const selected = StaffPeopleFilter({
      people: workforce,
      teams: [],
      selected: onChange.mock.calls[0]?.[0],
      onChange,
    })
    expect(
      findAll(selected, (node) => node.props['aria-label']?.startsWith('Quitar persona') ?? false),
    ).toHaveLength(20)
  })
})
