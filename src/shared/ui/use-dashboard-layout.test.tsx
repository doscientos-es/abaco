import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { snapDashboardWidth } from '@/shared/domain/dashboard-layout'

import { useDashboardLayout, type DashboardLayoutController } from './use-dashboard-layout'

const state = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }))
vi.mock('react', async (load) => ({
  ...(await load<object>()),
  useState: (initial: unknown) => {
    const index = state.index++
    if (index >= state.values.length) state.values[index] = initial
    return [
      state.values[index],
      (next: unknown) => {
        state.values[index] = typeof next === 'function' ? next(state.values[index]) : next
      },
    ]
  },
}))

type Id = 'metrics' | 'chart' | 'exports'
type Layout = { modules: { id: Id; width: number; format: string }[] }
const createModule = (id: Id) => ({ id, width: 6, format: 'table' })
const defaults = (): Layout => ({ modules: [createModule('metrics'), createModule('chart')] })

function setup(initial = defaults(), enabled = true) {
  let saved = initial
  const capture = vi.fn<(editor: DashboardLayoutController<Layout>) => void>()
  const onSave = vi.fn((next: Layout) => {
    saved = next
  })
  function Harness() {
    const editor = useDashboardLayout({ saved, defaults, createModule, onSave, enabled })
    capture(editor)
    return null
  }
  return {
    onSave,
    render: () => {
      state.index = 0
      capture.mockClear()
      renderToStaticMarkup(<Harness />)
      const call = capture.mock.lastCall
      if (!call) throw new Error('The dashboard editor did not render')
      return call[0]
    },
  }
}

describe('shared dashboard editor', () => {
  beforeEach(() => {
    state.values = []
  })

  it('keeps reorder, resize and chart settings in the draft until saved', () => {
    const original = defaults()
    const { render, onSave } = setup(original)
    render().start()
    const draft = render()
    expect(draft.changed).toBe(false)
    draft.move('chart', 0)
    draft.move('chart', -1)
    draft.move('metrics', 0.5)
    draft.resize('chart', 9)
    draft.changeModule('chart', (item) => ({ ...item, format: 'bars' }))
    expect(render().layout.modules).toEqual([
      { id: 'chart', width: 9, format: 'bars' },
      createModule('metrics'),
    ])
    expect(original).toEqual(defaults())
    expect(onSave).not.toHaveBeenCalled()
    render().save()
    expect(render().editing).toBe(false)
    expect(onSave).toHaveBeenCalledExactlyOnceWith(render().layout)
  })

  it('adds immediately outside edit mode and discards unsaved changes when cancelled', () => {
    const { render, onSave } = setup()
    render().add('exports')
    render().add('exports')
    expect(onSave).toHaveBeenCalledTimes(1)
    render().start()
    const draft = render()
    draft.remove('metrics')
    draft.restore()
    expect(render().layout).toEqual(defaults())
    render().cancel()
    expect(render().layout.modules.map(({ id }) => id)).toEqual(['metrics', 'chart', 'exports'])
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('keeps dashboard mutations disabled without customization permission', () => {
    const { render, onSave } = setup(defaults(), false)
    render().start()
    render().add('exports')
    expect(render().editing).toBe(false)
    expect(render().layout).toEqual(defaults())
    expect(onSave).not.toHaveBeenCalled()
  })

  it('only accepts supported widths and respects the module minimum', () => {
    expect(snapDashboardWidth(7.6, 6)).toBe(8)
    expect(snapDashboardWidth(2, 6)).toBe(6)
    expect(snapDashboardWidth(4.1, 3)).toBe(4)
    expect(snapDashboardWidth(25, 3)).toBe(12)
    expect(snapDashboardWidth('invalid', 6, 12)).toBe(12)
  })
})
