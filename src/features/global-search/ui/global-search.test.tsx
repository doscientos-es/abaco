import type { ComponentProps, ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SearchItem } from '../domain/search'
import { GlobalSearch } from './global-search'

const mocks = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  navigate: vi.fn(),
  retry: vi.fn(),
  presses: new Map<string, () => void>(),
  input: {} as ComponentProps<'input'>,
  items: [] as SearchItem[],
  loading: false,
  failed: false,
}))
vi.mock('react', async (load) => ({
  ...(await load<typeof React>()),
  useState: (initial: unknown) => {
    const index = mocks.cursor++
    if (!(index in mocks.states)) mocks.states[index] = initial
    return [
      mocks.states[index],
      (value: unknown) => {
        mocks.states[index] = typeof value === 'function' ? value(mocks.states[index]) : value
      },
    ]
  },
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('../application/use-search-results', () => ({
  useSearchResults: () => ({
    items: mocks.items,
    loading: mocks.loading,
    failed: mocks.failed,
    retry: mocks.retry,
  }),
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({
    children,
    onPress,
    'aria-label': label,
  }: {
    children: ReactNode
    onPress: () => void
    'aria-label'?: string
  }) => {
    mocks.presses.set(label ?? (typeof children === 'string' ? children : ''), onPress)
    return <button>{children}</button>
  },
  Dialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  Input: (props: ComponentProps<'input'>) => {
    mocks.input = props
    return <input {...props} />
  },
  Kbd: ({ children }: { children: ReactNode }) => <kbd>{children}</kbd>,
}))

const navigation: SearchItem[] = [
  {
    id: 'clients',
    title: 'Clientes',
    category: 'Navegación',
    shortcut: 'g c',
    target: { to: '/clientes' },
  },
  { id: 'work', title: 'Planificación', category: 'Navegación', target: { to: '/trabajos' } },
]
function render() {
  mocks.cursor = 0
  return renderToStaticMarkup(<GlobalSearch navigation={navigation} />)
}
function open() {
  render()
  mocks.presses.get('Búsqueda global')?.()
  return render()
}
function key(key: string, isComposing = false) {
  const event = { key, nativeEvent: { isComposing }, preventDefault: vi.fn() }
  mocks.input.onKeyDown?.(event as unknown as React.KeyboardEvent<HTMLInputElement>)
  return event
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.states = []
  mocks.presses.clear()
  mocks.items = navigation
  mocks.loading = false
  mocks.failed = false
})

describe('global command palette', () => {
  it('opens on demand, links the combobox to its options and navigates using arrows and Enter', () => {
    expect(render()).not.toContain('role="combobox"')
    const html = open()
    expect(html).toContain(`id="${mocks.input['aria-controls']}"`)
    expect(html).toContain(`id="${mocks.input['aria-activedescendant']}"`)
    expect(key('ArrowUp').preventDefault).toHaveBeenCalledOnce()
    render()
    key('Enter')
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/trabajos' })
    expect(render()).not.toContain('role="combobox"')
  })

  it('wraps downwards, ignores composition and tolerates an empty result set', () => {
    open()
    key('ArrowDown')
    render()
    key('ArrowDown')
    render()
    expect(key('Enter', true).preventDefault).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
    key('Enter')
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/clientes' })
    mocks.items = []
    expect(open()).toContain('No hay coincidencias')
    key('ArrowDown')
    render()
    key('Enter')
    expect(mocks.navigate).toHaveBeenCalledOnce()
    expect(mocks.input['aria-activedescendant']).toBeUndefined()
  })

  it('keeps available results visible on partial failure and exposes retry and loading', () => {
    mocks.failed = true
    expect(open()).toContain('Algunos recursos no se han podido consultar')
    expect(render()).toContain('Clientes')
    mocks.presses.get('Reintentar')?.()
    expect(mocks.retry).toHaveBeenCalledOnce()
    mocks.loading = true
    expect(render()).toContain('Buscando…')
  })

  it('shows only supplied navigation shortcuts in its help', () => {
    render()
    mocks.presses.get('Atajos de teclado')?.()
    const html = render()
    expect(html).toContain('<kbd>g c</kbd>')
    expect(html).not.toContain('<kbd>g f</kbd>')
    expect(html).not.toContain('role="combobox"')
  })
})
