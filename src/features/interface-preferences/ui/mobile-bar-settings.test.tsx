import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const drag = vi.hoisted(() => ({
  finish: (_event: {
    canceled: boolean
    operation: { source: { id: string; index: number } | null }
  }) => {},
  sortable: vi.fn(() => ({ ref: vi.fn(), isDragging: false })),
}))

vi.mock('@dnd-kit/react', () => ({
  PointerSensor: class {},
  DragDropProvider: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode
    onDragEnd: typeof drag.finish
  }) => {
    drag.finish = onDragEnd
    return children
  },
}))
vi.mock('@dnd-kit/react/sortable', () => ({
  useSortable: drag.sortable,
  isSortable: (source: object | null) => source !== null && 'index' in source,
}))

import { MobileBarSettings } from './mobile-bar-settings'

const home = { to: '/', label: 'Resumen', icon: <svg data-icon="home" /> }
const estimates = { to: '/presupuestos', label: 'Presupuestos', mobileLabel: 'Presup.', icon: null }

function renderBar(mobile = [home, estimates]) {
  const moveShortcut = vi.fn()
  const html = renderToStaticMarkup(
    <MobileBarSettings
      mobile={mobile}
      choices={[home, estimates]}
      moveShortcut={moveShortcut}
      setShortcut={vi.fn()}
      resetMobile={vi.fn()}
    />,
  )
  return { html, moveShortcut }
}

describe('mobile bar settings', () => {
  it('shows the real shortcut labels in preview order while keeping search at the end and unsortable', () => {
    drag.sortable.mockClear()
    const { html } = renderBar([estimates, home])
    const preview = html.slice(
      html.indexOf('data-preview="true"'),
      html.indexOf('Cambiar acceso 1'),
    )
    expect(preview).toMatch(
      />Presup\.<\/span>.*data-icon="home".*>Resumen<\/span>.*>Buscar<\/span>/,
    )
    expect(preview).toContain('aria-label="Presupuestos" aria-current="true"')
    expect(preview).not.toContain('aria-label="Resumen" aria-current=')
    expect(drag.sortable.mock.calls).toEqual([
      [{ id: estimates.to, index: 0, disabled: false }],
      [{ id: home.to, index: 1, disabled: false }],
    ])
    expect(html).toContain('Mover Presupuestos a la derecha')
  })

  it('applies the final sortable index on a drop, but not when the drag was canceled', () => {
    const { moveShortcut } = renderBar()
    const operation = { source: { id: estimates.to, index: 0 } }
    drag.finish({ operation, canceled: true })
    drag.finish({ operation: { source: null }, canceled: false })
    expect(moveShortcut).not.toHaveBeenCalled()
    drag.finish({ operation, canceled: false })
    expect(moveShortcut).toHaveBeenCalledExactlyOnceWith(estimates.to, 0)
  })
})
