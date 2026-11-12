import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { StaffFunctionPicker } from './staff-function-picker'

type Input = ReactElement<{
  checked: boolean
  onChange: (event: { target: { checked: boolean } }) => void
}>
type Label = ReactElement<{ children: [Input, string] }>
type List = ReactElement<{ children: Label[] }>

describe('staff function picker', () => {
  it('adds and removes individual functions without replacing the other selections', () => {
    const onChange = vi.fn()
    const fieldset = StaffFunctionPicker({
      functions: [
        { id: 'a', name: 'Electricidad' },
        { id: 'b', name: 'Fontanería' },
      ],
      selected: ['a'],
      onChange,
    })
    const list = fieldset.props.children[1] as List
    const [first, second] = list.props.children
    expect(first?.props.children[0].props.checked).toBe(true)
    expect(second?.props.children[0].props.checked).toBe(false)
    second?.props.children[0].props.onChange({ target: { checked: true } })
    expect(onChange).toHaveBeenLastCalledWith(['a', 'b'])
    first?.props.children[0].props.onChange({ target: { checked: false } })
    expect(onChange).toHaveBeenLastCalledWith([])
  })
})
