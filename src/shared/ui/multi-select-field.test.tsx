import type { ComponentProps, ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MultiSelectField } from './multi-select-field'

const mocks = vi.hoisted(() => ({
  query: '',
  change: vi.fn(),
  input: {} as ComponentProps<'input'>,
  options: new Map<string, (checked: boolean) => void>(),
  clear: () => {},
}))
vi.mock('react', async (load) => ({
  ...(await load<typeof React>()),
  useState: () => [
    mocks.query,
    (value: string) => {
      mocks.query = value
    },
  ],
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({
    children,
    onPress,
    isDisabled,
  }: {
    children: ReactNode
    onPress?: () => void
    isDisabled?: boolean
  }) => {
    if (onPress) mocks.clear = onPress
    return <button disabled={isDisabled}>{children}</button>
  },
  Checkbox: ({
    children,
    isSelected,
    onChange,
    isDisabled,
  }: {
    children: string
    isSelected: boolean
    onChange: (checked: boolean) => void
    isDisabled?: boolean
  }) => {
    mocks.options.set(children, onChange)
    return (
      <label>
        <input type="checkbox" checked={isSelected} disabled={isDisabled} readOnly />
        {children}
      </label>
    )
  },
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  Input: (props: ComponentProps<'input'>) => {
    mocks.input = props
    return <input {...props} />
  },
}))
const options = [
  { value: 'a', label: 'Electricidad' },
  { value: 'b', label: 'Fontanería' },
  { value: 'c', label: 'Cristales' },
]
const render = (value = ['a'], isDisabled = false) =>
  renderToStaticMarkup(
    <MultiSelectField
      label="Funciones"
      options={options}
      value={value}
      onChange={mocks.change}
      isDisabled={isDisabled}
    />,
  )
beforeEach(() => {
  vi.clearAllMocks()
  mocks.query = ''
  mocks.options.clear()
})

describe('searchable multi-selection', () => {
  it('filters without accents and adds or removes values without losing hidden selections', () => {
    mocks.query = 'fontaneria'
    render()
    expect([...mocks.options.keys()]).toEqual(['Fontanería'])
    mocks.options.get('Fontanería')?.(true)
    expect(mocks.change).toHaveBeenLastCalledWith(['a', 'b'])
    render(['a', 'b'])
    mocks.options.get('Fontanería')?.(false)
    expect(mocks.change).toHaveBeenLastCalledWith(['a'])
  })

  it('clears all selections and reports no matches without changing the value', () => {
    mocks.query = 'inexistente'
    expect(render(['a', 'b'])).toContain('No hay coincidencias')
    expect(mocks.change).not.toHaveBeenCalled()
    mocks.clear()
    expect(mocks.change).toHaveBeenCalledWith([])
  })

  it('disables its trigger, choices and clear action while the editor saves', () => {
    const html = render(['a'], true)
    expect(html.match(/disabled=""/g)).toHaveLength(6)
  })
})
