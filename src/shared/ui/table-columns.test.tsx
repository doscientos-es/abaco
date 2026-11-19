import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TableColumnsCells, TableColumnsHeader, useTableColumns } from './table-columns'

const controls = vi.hoisted(() => ({
  actions: new Map<string, () => void>(),
  toggle: new Map<string, (value: boolean) => void>(),
}))
vi.mock('@doscientos/ui', () => ({
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  Popover: ({ children, trigger }: { children: React.ReactNode; trigger: React.ReactNode }) => (
    <>
      {trigger}
      {children}
    </>
  ),
  Button: ({ children, onPress }: { children: string; onPress: () => void }) => {
    controls.actions.set(children, onPress)
    return <button>{children}</button>
  },
  IconButton: ({
    children,
    label,
    onPress,
  }: {
    children: React.ReactNode
    label: string
    onPress?: () => void
  }) => {
    if (onPress) controls.actions.set(label, onPress)
    return <button aria-label={label}>{children}</button>
  },
  Checkbox: ({
    children,
    onChange,
    isDisabled,
  }: {
    children: string
    onChange: (value: boolean) => void
    isDisabled: boolean
  }) => {
    if (!isDisabled) controls.toggle.set(children, onChange)
    return <span>{children}</span>
  },
}))

afterEach(() => {
  controls.actions.clear()
  controls.toggle.clear()
  vi.unstubAllGlobals()
})

describe('table columns', () => {
  it('renders matching headers and cells and applies hide, move and reset actions', () => {
    const commit = vi.fn()
    const reset = vi.fn()
    const controller: ReturnType<typeof useTableColumns> = {
      ordered: [
        { id: 'name', label: 'Nombre', required: true },
        { id: 'price', label: 'Precio' },
      ],
      visible: [
        { id: 'price', label: 'Precio' },
        { id: 'name', label: 'Nombre', required: true },
      ],
      preferences: { order: ['name', 'price'], hidden: [] },
      commit,
      reset,
    }
    const html = renderToStaticMarkup(
      <table>
        <thead>
          <tr>
            <TableColumnsHeader columns={controller} tableName="ejemplo" />
          </tr>
        </thead>
        <tbody>
          <tr>
            <TableColumnsCells
              columns={controller}
              cells={{ name: <td>Cliente A</td>, price: <td>42 €</td> }}
            />
            <td>Acción</td>
          </tr>
        </tbody>
      </table>,
    )
    expect(html.indexOf('<th>Precio</th>')).toBeLessThan(html.indexOf('<th>Nombre</th>'))
    expect(html.indexOf('<td>42 €</td>')).toBeLessThan(html.indexOf('<td>Cliente A</td>'))
    expect(html).toContain('Personalizar columnas de ejemplo')
    controls.toggle.get('Precio')?.(false)
    expect(commit).toHaveBeenCalledWith({ order: ['name', 'price'], hidden: ['price'] })
    controls.actions.get('Bajar Nombre')?.()
    expect(commit).toHaveBeenCalledWith({ order: ['price', 'name'], hidden: [] })
    controls.actions.get('Restaurar columnas')?.()
    expect(reset).toHaveBeenCalledOnce()
    expect(controls.toggle.has('Nombre')).toBe(false)
  })

  it('restores visibility and ordering from local storage after remounting', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    })
    const definitions = [
      { id: 'name', label: 'Nombre', required: true },
      { id: 'price', label: 'Precio' },
      { id: 'status', label: 'Estado' },
    ]
    function Example() {
      const columns = useTableColumns('example', definitions)
      return (
        <table>
          <thead>
            <tr>
              <TableColumnsHeader columns={columns} tableName="ejemplo" />
            </tr>
          </thead>
          <tbody>
            <tr>
              <TableColumnsCells
                columns={columns}
                cells={{ name: <td>Ana</td>, price: <td>42</td>, status: <td>Activo</td> }}
              />
            </tr>
          </tbody>
        </table>
      )
    }
    renderToStaticMarkup(<Example />)
    controls.toggle.get('Precio')?.(false)
    renderToStaticMarkup(<Example />)
    controls.actions.get('Subir Estado')?.()
    renderToStaticMarkup(<Example />)
    controls.actions.get('Subir Estado')?.()
    const html = renderToStaticMarkup(<Example />)
    expect(html).toContain('<th>Estado</th><th>Nombre</th>')
    expect(html).toContain('<td>Activo</td><td>Ana</td>')
    expect(html).not.toContain('<td>42</td>')
    controls.actions.get('Restaurar columnas')?.()
    const reset = renderToStaticMarkup(<Example />)
    expect(reset).toContain('<th>Nombre</th><th>Precio</th><th>Estado</th>')
    expect(reset).toContain('<td>Ana</td><td>42</td><td>Activo</td>')
  })
})
