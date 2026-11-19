import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { calendarDate, dateValue } from '@/shared/lib/date-range'

import { CalendarToolbar } from './calendar-toolbar'

type Props = {
  children?: ReactNode
  'aria-label'?: string
  label?: string
  onPress?: () => void
  onChange?: (value: string) => void
}
function find(
  node: ReactNode,
  matches: (props: Props) => boolean,
): ReactElement<Props> | undefined {
  let match: ReactElement<Props> | undefined
  Children.forEach(node, (child) => {
    if (!match && isValidElement<Props>(child)) {
      match = matches(child.props) ? child : find(child.props.children, matches)
    }
  })
  return match
}

describe('calendar period navigation', () => {
  it.each([
    ['day', '2026-11-15', '2026-11-17'],
    ['week', '2026-11-09', '2026-11-23'],
    ['month', '2026-10-16', '2026-12-16'],
  ] as const)(
    'moves to the previous and next %s with labeled icon buttons',
    (view, previous, next) => {
      const onDateChange = vi.fn()
      const tree = CalendarToolbar({
        value: new Date(2026, 10, 16, 12),
        view,
        onDateChange,
        onViewChange: vi.fn(),
      })
      find(tree, (props) => props['aria-label'] === 'Periodo anterior')?.props.onPress?.()
      expect(dateValue(onDateChange.mock.lastCall?.[0])).toBe(previous)
      find(tree, (props) => props['aria-label'] === 'Periodo siguiente')?.props.onPress?.()
      expect(dateValue(onDateChange.mock.lastCall?.[0])).toBe(next)
    },
  )

  it('navigates to the supplied business date and parses a date without a UTC shift', () => {
    const onDateChange = vi.fn()
    const tree = CalendarToolbar({
      value: calendarDate('2026-11-16'),
      view: 'month',
      today: calendarDate('2026-11-17'),
      onDateChange,
    })
    expect(find(tree, (props) => props.children === 'Semana')).toBeUndefined()
    find(tree, (props) => props.children === 'Hoy')?.props.onPress?.()
    expect(dateValue(onDateChange.mock.lastCall?.[0])).toBe('2026-11-17')
    const field = find(tree, (props) => props.label === 'Fecha de referencia')
    field?.props.onChange?.('')
    expect(onDateChange).toHaveBeenCalledTimes(1)
    field?.props.onChange?.('2028-02-29')
    expect(dateValue(onDateChange.mock.lastCall?.[0])).toBe('2028-02-29')
  })

  it('switches the calendar period independently of the date', () => {
    const onDateChange = vi.fn()
    const onViewChange = vi.fn()
    const tree = CalendarToolbar({
      value: calendarDate('2026-11-16'),
      view: 'month',
      onDateChange,
      onViewChange,
    })
    find(tree, (props) => props.children === 'Semana')?.props.onPress?.()
    expect(onViewChange).toHaveBeenCalledWith('week')
    expect(onDateChange).not.toHaveBeenCalled()
  })
})
