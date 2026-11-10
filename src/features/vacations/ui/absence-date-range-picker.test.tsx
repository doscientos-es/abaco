import {
  Children,
  isValidElement,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import type * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsenceDateRangePicker } from './absence-date-range-picker'

const hooks = vi.hoisted(() => ({ index: 0, setFocused: vi.fn(), setVisible: vi.fn() }))
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>()
  return {
    ...actual,
    useState: (initial: () => string) => [
      initial(),
      hooks.index++ === 0 ? hooks.setFocused : hooks.setVisible,
    ],
    useRef: (value: unknown) => ({ current: value }),
    useEffect: () => {},
    useId: () => 'calendar-instructions',
  }
})

type ButtonProps = {
  children?: ReactNode
  'aria-label'?: string
  tabIndex?: number
  onClick?: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void
}

function button(node: ReactNode, label: string): ReactElement<ButtonProps> | undefined {
  let result: ReactElement<ButtonProps> | undefined
  Children.forEach(node, (child) => {
    if (result || !isValidElement<ButtonProps>(child)) return
    if (
      child.type === 'button' &&
      (child.props['aria-label'] === label || child.props.children === label)
    )
      result = child
    else result = button(child.props.children, label)
  })
  return result
}

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('es-ES', { dateStyle: 'full' }).format(new Date(`${date}T12:00:00`))
const renderPicker = (
  start: string,
  end: string,
  endOptional: boolean,
  onChange: (start: string, end: string) => void,
  mode: 'absence' | 'filter' = 'absence',
) => {
  hooks.index = 0
  return AbsenceDateRangePicker({ start, end, endOptional, onChange, mode })
}

describe('selector de fechas de ausencia', () => {
  beforeEach(() => vi.clearAllMocks())

  it('selecciona un intervalo, lo reinicia y permite dejar el fin desconocido', () => {
    const onChange = vi.fn()
    let tree = renderPicker('2026-11-10', '', true, onChange)
    button(tree, dateLabel('2026-11-12'))?.props.onClick?.()
    expect(onChange).toHaveBeenLastCalledWith('2026-11-10', '2026-11-12')

    tree = renderPicker('2026-11-10', '2026-11-12', true, onChange)
    button(tree, 'Dejar fin desconocido')?.props.onClick?.()
    expect(onChange).toHaveBeenLastCalledWith('2026-11-10', '')
    button(tree, 'Limpiar fechas')?.props.onClick?.()
    expect(onChange).toHaveBeenLastCalledWith('', '')
    expect(
      button(renderPicker('2026-11-10', '2026-11-12', false, onChange), 'Dejar fin desconocido'),
    ).toBeUndefined()
  })

  it('navega entre meses con el teclado sin enviar el formulario', () => {
    const tree = renderPicker('2026-11-30', '', false, vi.fn())
    const day = button(tree, `${dateLabel('2026-11-30')}, inicio`)
    expect(day?.props.tabIndex).toBe(0)
    const preventDefault = vi.fn()
    day?.props.onKeyDown?.({
      key: 'ArrowRight',
      preventDefault,
    } as unknown as KeyboardEvent<HTMLButtonElement>)
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(hooks.setFocused).toHaveBeenCalledWith('2026-12-01')
    expect(hooks.setVisible).toHaveBeenCalledWith('2026-12-01')
  })

  it('permite filtros abiertos por cualquiera de los extremos y limpiarlos', () => {
    const onChange = vi.fn()
    let tree = renderPicker('2026-11-10', '2026-11-12', false, onChange, 'filter')
    button(tree, 'Filtrar solo hasta')?.props.onClick?.()
    expect(onChange).toHaveBeenLastCalledWith('', '2026-11-12')
    button(tree, 'Filtrar solo desde')?.props.onClick?.()
    expect(onChange).toHaveBeenLastCalledWith('2026-11-10', '')

    tree = renderPicker('', '2026-11-12', false, onChange, 'filter')
    expect(button(tree, `${dateLabel('2026-11-12')}, fin`)).toBeDefined()
    button(tree, 'Limpiar fechas')?.props.onClick?.()
    expect(onChange).toHaveBeenLastCalledWith('', '')

    tree = renderPicker('2026-11-10', '', false, onChange, 'filter')
    button(tree, 'Filtrar solo hasta')?.props.onClick?.()
    expect(onChange).toHaveBeenLastCalledWith('', '2026-11-10')
  })
})
