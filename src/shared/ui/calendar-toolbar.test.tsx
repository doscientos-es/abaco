import { IconButton } from '@doscientos/ui'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { dateValue } from '@/shared/lib/date-range'

import { CalendarToolbar } from './calendar-toolbar'

type Props = { children?: ReactNode; label?: string; onPress?: () => void }
function find(node: ReactNode, label: string): ReactElement<Props> | undefined {
  let match: ReactElement<Props> | undefined
  Children.forEach(node, (child) => {
    if (!match && isValidElement<Props>(child)) {
      match =
        child.type === IconButton && child.props.label === label
          ? child
          : find(child.props.children, label)
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
      find(tree, 'Periodo anterior')?.props.onPress?.()
      expect(dateValue(onDateChange.mock.lastCall?.[0])).toBe(previous)
      find(tree, 'Periodo siguiente')?.props.onPress?.()
      expect(dateValue(onDateChange.mock.lastCall?.[0])).toBe(next)
    },
  )
})
