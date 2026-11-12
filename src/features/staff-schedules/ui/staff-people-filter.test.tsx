import { IconButton } from '@doscientos/ui'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import type * as React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { StaffPeopleFilter } from './staff-people-filter'

const setOpen = vi.hoisted(() => vi.fn())
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: () => [true, setOpen],
}))

type Props = {
  children?: ReactNode
  checked?: boolean
  onChange?: (event: { target: { checked: boolean } }) => void
  onPress?: () => void
  label?: string
  trigger?: ReactElement<{ 'aria-label': string }>
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
  { userId: 'ana', name: 'Ana', schedule: null },
  { userId: 'luis', name: 'Luis', schedule: null },
]

describe('staff people filter', () => {
  it('starts with Todas and allows selecting none, a subset, or everyone', () => {
    const onChange = vi.fn()
    const render = (selected: string[] | null) =>
      StaffPeopleFilter({ people, selected, onChange, onEdit: vi.fn() })
    const all = render(null)
    expect(all.props.trigger.props['aria-label']).toBe('Personas: Todas')
    const checks = findAll(all, (node) => node.type === 'input')
    expect(checks.map((node) => node.props.checked)).toEqual([true, true, true])
    checks[0]?.props.onChange?.({ target: { checked: false } })
    expect(onChange).toHaveBeenLastCalledWith([])
    checks[1]?.props.onChange?.({ target: { checked: false } })
    expect(onChange).toHaveBeenLastCalledWith(['luis'])

    const partial = render(['luis'])
    expect(partial.props.trigger.props['aria-label']).toBe('Personas: Luis')
    const partialChecks = findAll(partial, (node) => node.type === 'input')
    expect(partialChecks.map((node) => node.props.checked)).toEqual([false, false, true])
    partialChecks[1]?.props.onChange?.({ target: { checked: true } })
    expect(onChange).toHaveBeenLastCalledWith(null)
    partialChecks[0]?.props.onChange?.({ target: { checked: true } })
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(render([]).props.trigger.props['aria-label']).toBe('Personas: Ninguna')
  })

  it('opens the editor for the chosen person and closes the picker', () => {
    const onEdit = vi.fn()
    const tree = StaffPeopleFilter({ people, selected: [], onChange: vi.fn(), onEdit })
    const edit = findAll(
      tree,
      (node) => node.type === IconButton && node.props.label === 'Editar horario de Ana',
    )[0]
    edit?.props.onPress?.()
    expect(onEdit).toHaveBeenCalledWith('ana')
    expect(setOpen).toHaveBeenCalledWith(false)
  })
})
