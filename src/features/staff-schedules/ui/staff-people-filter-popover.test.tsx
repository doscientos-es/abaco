import { Popover } from '@doscientos/ui'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StaffPeopleFilterPopover } from './staff-people-filter-popover'

const state = vi.hoisted(() => ({ setOpen: vi.fn() }))
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: () => [false, state.setOpen],
}))

const people = [
  { userId: 'ana', name: 'Ana', schedule: null },
  { userId: 'luis', name: 'Luis', schedule: null },
]
const teams = [{ id: 'north', name: 'Norte', memberIds: ['ana', 'luis'] }]
const selected = { personIds: ['ana'], teamIds: ['north'] }

describe('staff people filter popover', () => {
  beforeEach(() => vi.clearAllMocks())

  it('summarizes unique selected people and opens a bounded popover', () => {
    const tree = StaffPeopleFilterPopover({ people, teams, selected, onChange: vi.fn() })
    expect(tree.type).toBe(Popover)
    expect(tree.props.isOpen).toBe(false)
    expect(tree.props.placement).toBe('bottom start')
    expect(renderToStaticMarkup(tree.props.trigger)).toContain('Personas y equipos · 2 de 2')
    expect(tree.props.children.props.onEdit).toBeUndefined()
    tree.props.onOpenChange?.(true)
    expect(state.setOpen).toHaveBeenCalledWith(true)
  })

  it('closes the popover before opening the selected person’s schedule', () => {
    const onEdit = vi.fn(() => expect(state.setOpen).toHaveBeenCalledWith(false))
    const tree = StaffPeopleFilterPopover({ people, teams, selected, onChange: vi.fn(), onEdit })
    tree.props.children.props.onEdit?.('ana')
    expect(state.setOpen).toHaveBeenCalledWith(false)
    expect(onEdit).toHaveBeenCalledWith('ana')
  })
})
