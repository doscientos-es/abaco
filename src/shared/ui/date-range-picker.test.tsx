import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import type * as React from 'react'
import { DayPicker } from 'react-day-picker'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { DateRangeCalendar, DateRangePicker } from './date-range-picker'

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>()
  return {
    ...actual,
    useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
  }
})

type NodeProps = {
  children?: ReactNode
  onClick?: () => void
  onSelect?: (range: unknown, date: Date) => void
  selected?: { from?: Date; to?: Date }
  numberOfMonths?: number
}

function find(
  node: ReactNode,
  predicate: (node: ReactElement<NodeProps>) => boolean,
): ReactElement<NodeProps> | undefined {
  let found: ReactElement<NodeProps> | undefined
  Children.forEach(node, (child) => {
    if (!found && isValidElement<NodeProps>(child)) {
      found = predicate(child) ? child : find(child.props.children, predicate)
    }
  })
  return found
}

describe('selector de fechas', () => {
  it('usa dos meses y permite seleccionar días y rangos inclusivos', () => {
    const onChange = vi.fn()
    const tree = DateRangeCalendar({ start: '2026-11-10', end: '', onChange, label: 'Fechas' })
    const calendar = find(tree, (node) => node.type === DayPicker)
    expect(calendar?.props.numberOfMonths).toBe(2)
    calendar?.props.onSelect?.(undefined, new Date(2026, 10, 12, 12))
    expect(onChange).toHaveBeenCalledWith('2026-11-10', '2026-11-12')
    calendar?.props.onSelect?.(undefined, new Date(2026, 10, 10, 12))
    expect(onChange).toHaveBeenCalledWith('2026-11-10', '2026-11-10')
  })

  it('conserva filtros con un solo límite y ausencias sin fin', () => {
    const onChange = vi.fn()
    const props = { start: '2026-11-10', end: '2026-11-12', onChange, label: 'Fechas' }
    const filter = DateRangeCalendar({ ...props, allowOpenStart: true, allowOpenEnd: true })
    find(filter, (node) => node.props.children === 'Filtrar solo hasta')?.props.onClick?.()
    expect(onChange).toHaveBeenLastCalledWith('', '2026-11-12')
    find(filter, (node) => node.props.children === 'Filtrar solo desde')?.props.onClick?.()
    expect(onChange).toHaveBeenLastCalledWith('2026-11-10', '')
    const absence = DateRangeCalendar({ ...props, allowOpenEnd: true })
    find(absence, (node) => node.props.children === 'Dejar fin desconocido')?.props.onClick?.()
    expect(onChange).toHaveBeenLastCalledWith('2026-11-10', '')
    find(absence, (node) => node.props.children === 'Limpiar fechas')?.props.onClick?.()
    expect(onChange).toHaveBeenLastCalledWith('', '')
  })

  it('aplica un atajo con fechas locales', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 11, 31, 12))
    try {
      const onChange = vi.fn()
      const tree = DateRangeCalendar({ start: '', end: '', onChange, label: 'Fechas' })
      find(tree, (node) => node.props.children === 'La semana que viene')?.props.onClick?.()
      expect(onChange).toHaveBeenCalledWith('2027-01-04', '2027-01-10')
    } finally {
      vi.useRealTimers()
    }
  })

  it('mantiene el calendario cerrado hasta abrir el selector', () => {
    const html = renderToStaticMarkup(
      <DateRangePicker start="" end="" onChange={() => {}} label="Fechas de la ausencia" />,
    )
    expect(html).toContain('Fechas de la ausencia')
    expect(html).toContain('Selecciona un día')
    expect(html).not.toContain('La semana que viene')
    expect(html).not.toContain('rdp-month_grid')
  })
})
