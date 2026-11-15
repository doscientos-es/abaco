import { Children, isValidElement, type InputHTMLAttributes, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ContractPeoplePicker } from './contract-people-picker'

describe('contract people picker', () => {
  it('shows selected workers and adds or removes them without replacing the other selections', () => {
    const onChange = vi.fn()
    const element = ContractPeoplePicker({
      people: [
        { id: 'a', label: 'Ana' },
        { id: 'b', label: 'Bea' },
      ],
      selected: ['a'],
      onChange,
    })
    const inputs: InputHTMLAttributes<HTMLInputElement>[] = []
    function collect(node: ReactNode) {
      Children.forEach(node, (child) => {
        if (!isValidElement<{ children?: ReactNode }>(child)) return
        if (child.type === 'input')
          inputs.push(child.props as InputHTMLAttributes<HTMLInputElement>)
        collect(child.props.children)
      })
    }
    collect(element)
    expect(renderToStaticMarkup(element)).toContain('Personas asignadas · 1')
    expect(inputs.map((input) => input.checked)).toEqual([true, false])
    inputs[1]?.onChange?.({ target: { checked: true } } as React.ChangeEvent<HTMLInputElement>)
    inputs[0]?.onChange?.({ target: { checked: false } } as React.ChangeEvent<HTMLInputElement>)
    expect(onChange.mock.calls).toEqual([[['a', 'b']], [[]]])
  })
})
