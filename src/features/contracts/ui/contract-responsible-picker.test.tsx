import { Children, isValidElement, type InputHTMLAttributes, type ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ search: '' }))
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: () => [
    state.search,
    (value: string) => {
      state.search = value
    },
  ],
}))

import { ContractResponsiblePicker } from './contract-responsible-picker'

const people = [
  { id: 'a', label: 'Ána' },
  { id: 'b', label: 'Bea' },
]
const teams = [
  { id: 't', name: 'Ana equipo', archived: false },
  { id: 'old', name: 'Archivado', archived: true },
]

function inputs(node: ReactNode) {
  const result: InputHTMLAttributes<HTMLInputElement>[] = []
  function collect(value: ReactNode) {
    Children.forEach(value, (child) => {
      if (!isValidElement<{ children?: ReactNode }>(child)) return
      if (child.type === 'input') result.push(child.props as InputHTMLAttributes<HTMLInputElement>)
      collect(child.props.children)
    })
  }
  collect(node)
  return result
}

beforeEach(() => {
  state.search = ''
})

describe('contract responsible picker', () => {
  it('searches both people and teams without losing selected people', () => {
    const change = vi.fn()
    const props = {
      people,
      teams,
      selected: { people: ['b'], team: null },
      disabled: false,
      onChange: change,
    }
    const initial = ContractResponsiblePicker(props)
    inputs(initial)[0]?.onChange?.({
      target: { value: 'ana' },
    } as React.ChangeEvent<HTMLInputElement>)
    const filtered = ContractResponsiblePicker(props)
    const html = renderToStaticMarkup(filtered)
    expect(html).toContain('Ána')
    expect(html).toContain('Ana equipo')
    expect(html).toContain('Bea')
    expect(html).not.toContain('Archivado')
    const [, person, team] = inputs(filtered)
    person?.onChange?.({ target: { checked: true } } as React.ChangeEvent<HTMLInputElement>)
    team?.onChange?.({ target: { checked: true } } as React.ChangeEvent<HTMLInputElement>)
    expect(change.mock.calls).toEqual([
      [{ people: ['b', 'a'], team: null }],
      [{ people: [], team: 't' }],
    ])
  })

  it('replaces a team with a person and keeps an unavailable team visible', () => {
    const change = vi.fn()
    const element = ContractResponsiblePicker({
      people,
      teams,
      selected: { people: [], team: 'old' },
      disabled: false,
      onChange: change,
    })
    expect(renderToStaticMarkup(element)).toContain('Archivado (archivado)')
    inputs(element)[1]?.onChange?.({
      target: { checked: true },
    } as React.ChangeEvent<HTMLInputElement>)
    expect(change).toHaveBeenCalledWith({ people: ['a'], team: null })
  })
})
