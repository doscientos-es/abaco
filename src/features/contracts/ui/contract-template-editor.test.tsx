import type * as React from 'react'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  actions: new Map<string, () => void>(),
  fields: new Map<string, (value: string) => void>(),
}))
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
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
vi.mock('@doscientos/ui', () => ({
  Button: ({
    children,
    onPress,
    'aria-label': label,
  }: {
    children: ReactNode
    onPress?: () => void
    'aria-label'?: string
  }) => {
    const text = (Array.isArray(children) ? children : [children])
      .filter((child): child is string => typeof child === 'string')
      .join('')
    if (onPress) mocks.actions.set(label ?? text, onPress)
    return <button>{children}</button>
  },
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { revision: 0, sections: { before: [], after: [] } } }),
  useQueryClient: () => ({ setQueryData: vi.fn() }),
}))
vi.mock('@/shared/ui/form', () => ({
  TextField: ({
    label,
    value,
    onChange,
  }: {
    label: string
    value: string
    onChange: (value: string) => void
  }) => {
    mocks.fields.set(label, onChange)
    return <input aria-label={label} value={value} readOnly />
  },
  TextareaField: ({
    label,
    value,
    onChange,
  }: {
    label: string
    value: string
    onChange: (value: string) => void
  }) => {
    mocks.fields.set(label, onChange)
    return <textarea aria-label={label} readOnly value={value} />
  },
}))

import { ContractTemplateEditor } from './contract-template-editor'

function render() {
  mocks.cursor = 0
  mocks.actions.clear()
  mocks.fields.clear()
  return renderToStaticMarkup(<ContractTemplateEditor tenantId="company" />)
}

describe('editor de plantilla de contrato', () => {
  beforeEach(() => {
    mocks.states = []
  })

  it('permite redactar, ordenar y eliminar secciones independientes alrededor del presupuesto', () => {
    render()
    mocks.actions.get('Añadir sección · antes del presupuesto')?.()
    render()
    mocks.fields.get('Título de la sección 1 · Antes del presupuesto')?.('Primera')
    render()
    mocks.actions.get('Añadir sección · antes del presupuesto')?.()
    render()
    mocks.fields.get('Título de la sección 2 · Antes del presupuesto')?.('Segunda')
    render()
    mocks.actions.get('Subir sección 2 · Antes del presupuesto')?.()
    let html = render()
    expect(html.indexOf('value="Segunda"')).toBeLessThan(html.indexOf('value="Primera"'))
    mocks.actions.get('Añadir sección · después del presupuesto')?.()
    render()
    mocks.fields.get('Texto de la sección 1 · Después del presupuesto')?.('Cláusula final')
    html = render()
    expect(html).toContain('Cláusula final')
    mocks.actions.get('Eliminar sección 1 · Antes del presupuesto')?.()
    html = render()
    expect(html).not.toContain('value="Segunda"')
    expect(html).toContain('value="Primera"')
    expect(html).toContain('Cláusula final')
  })
})
