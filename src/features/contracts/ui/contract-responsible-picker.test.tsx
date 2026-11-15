import {
  Children,
  isValidElement,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  workers: null as null | {
    options: { value: string; label: string }[]
    value: string[]
    maxSelections: number
    onChange: (value: string[]) => void
  },
}))
vi.mock('@/shared/ui/multi-select-field', () => ({
  MultiSelectField: (props: typeof state.workers) => {
    state.workers = props
    return <span>Trabajadores</span>
  },
}))
import { ContractResponsiblePicker } from './contract-responsible-picker'

const people = [
  { id: 'a', label: 'Ána' },
  { id: 'b', label: 'Bea' },
]
function buttons(node: ReactNode) {
  const result: ButtonHTMLAttributes<HTMLButtonElement>[] = []
  function collect(value: ReactNode) {
    Children.forEach(value, (child) => {
      if (!isValidElement<{ children?: ReactNode }>(child)) return
      if (child.type === 'button')
        result.push(child.props as ButtonHTMLAttributes<HTMLButtonElement>)
      collect(child.props.children)
    })
  }
  collect(node)
  return result
}

beforeEach(() => {
  state.workers = null
})

describe('contract responsible picker', () => {
  it('filters options while retaining and allowing removal of selected people', () => {
    const change = vi.fn()
    const props = {
      people,
      visiblePeople: people.slice(0, 1),
      selected: { people: ['b'], team: null },
      disabled: false,
      onChange: change,
    }
    const element = ContractResponsiblePicker(props)
    const html = renderToStaticMarkup(element)
    expect(html).toContain('Bea')
    expect(html).not.toContain('Equipo')
    expect(state.workers?.options).toEqual([{ value: 'a', label: 'Ána' }])
    expect(state.workers?.value).toEqual(['b'])
    expect(state.workers?.maxSelections).toBe(30)
    state.workers?.onChange(['b', 'a'])
    buttons(element)[0]?.onClick?.({} as MouseEvent<HTMLButtonElement>)
    expect(change.mock.calls).toEqual([
      [{ people: ['b', 'a'], team: null }],
      [{ people: [], team: null }],
    ])
  })

  it('explains that selecting workers replaces the existing team', () => {
    const change = vi.fn()
    const element = ContractResponsiblePicker({
      people,
      visiblePeople: people,
      selected: { people: [], team: 'old' },
      disabled: false,
      onChange: change,
    })
    const html = renderToStaticMarkup(element)
    expect(html).toContain('conserva un equipo asignado anteriormente')
    state.workers?.onChange([])
    expect(change).toHaveBeenCalledWith({ people: [], team: 'old' })
    state.workers?.onChange(['a'])
    expect(change).toHaveBeenCalledWith({ people: ['a'], team: null })
  })
})
