import type { ComponentProps, ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { MultiSelectField } from '@/shared/ui/multi-select-field'

import { StaffFunctionPicker } from './staff-function-picker'

describe('staff function picker', () => {
  it('passes every available function and current assignment to the shared searchable picker', () => {
    const onChange = vi.fn()
    const functions = Array.from({ length: 154 }, (_, index) => ({
      id: `${index}`,
      name: `Función ${index}`,
    }))
    const fieldset = StaffFunctionPicker({
      functions,
      selected: ['0', '153'],
      onChange,
    })
    const picker = fieldset.props.children[1] as ReactElement<
      ComponentProps<typeof MultiSelectField>
    >
    expect(picker.type).toBe(MultiSelectField)
    expect(picker.props.options).toEqual(
      functions.map((item) => ({ value: item.id, label: item.name })),
    )
    expect(picker.props.value).toEqual(['0', '153'])
    expect(picker.props.onChange).toBe(onChange)
  })

  it('points to the function catalogue when no functions exist', () => {
    const html = renderToStaticMarkup(
      <StaffFunctionPicker functions={[]} selected={[]} onChange={vi.fn()} />,
    )
    expect(html).toContain('Crea funciones en Personalizar')
    expect(html).not.toContain('Seleccionar…')
  })
})
