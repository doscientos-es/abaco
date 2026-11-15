import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useId: () => 'estimate-format-test',
}))

import { EstimateFormatPicker } from './estimate-format-picker'

describe('estimate format cards', () => {
  it.each(['table', 'sections'] as const)(
    'shows two illustrated radios with only %s selected',
    (value) => {
      const html = renderToStaticMarkup(
        <EstimateFormatPicker value={value} onChange={() => undefined} />,
      )
      expect(html).toContain('<legend')
      expect(html).toContain('Tipo de presupuesto')
      expect(html).toContain('Instalación')
      expect(html).toContain('Mantenimiento')
      expect(html.match(/type="radio"/g)).toHaveLength(2)
      expect(html.match(/checked=""/g)).toHaveLength(1)
      const selectedInput = html
        .match(/<input[^>]+>/g)
        ?.find((input) => input.includes(`value="${value}"`))
      expect(selectedInput).toContain('checked=""')
      expect(html.match(/<svg/g)).toHaveLength(2)
      expect(html).toContain('peer-focus-visible:ring-2')
      expect(html).not.toContain('<select')
    },
  )

  it('keeps the controls in one native radio group and notifies the selected format', () => {
    const onChange = vi.fn()
    const picker = EstimateFormatPicker({ value: 'table', onChange })
    const grid = picker.props.children[1]
    const cards = grid.props.children as React.ReactElement<{
      children: [
        React.ReactElement<React.InputHTMLAttributes<HTMLInputElement>>,
        React.ReactElement,
      ]
    }>[]
    const inputs = cards.map((card) => card.props.children[0])
    expect(inputs[0]?.props.name).toBe(inputs[1]?.props.name)
    for (const [index, input] of inputs.entries()) {
      expect(input.props['aria-describedby']).toBe(
        `estimate-format-test-${String(input.props.value)}-description`,
      )
      input.props.onChange?.({} as Parameters<NonNullable<typeof input.props.onChange>>[0])
      expect(onChange).toHaveBeenNthCalledWith(index + 1, input.props.value)
    }
  })
})
