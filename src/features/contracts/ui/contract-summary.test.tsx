import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServiceContract } from '../application/contract-actions'
import { ContractSummary } from './contract-summary'

const mocks = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  edit: undefined as (() => void) | undefined,
  form: undefined as undefined | { onCancel: () => void; onSaved: () => void },
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => {
    const index = mocks.cursor++
    if (!(index in mocks.states)) mocks.states[index] = initial
    return [
      mocks.states[index],
      (value: unknown) => {
        mocks.states[index] = value
      },
    ]
  },
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({ children, onPress }: { children: ReactNode; onPress: () => void }) => {
    mocks.edit = onPress
    return <button>{children}</button>
  },
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/presupuesto">{children}</a>,
}))
vi.mock('./contract-agreement-form', () => ({
  ContractAgreementForm: (props: { onCancel: () => void; onSaved: () => void }) => {
    mocks.form = props
    return <div>Formulario de edición</div>
  },
}))
vi.mock('./contract-status-panel', () => ({
  ContractStatusPanel: () => <div>Control de estado</div>,
}))
vi.mock('./contract-quick-actions', () => ({
  ContractQuickActions: () => <div>Acciones rápidas</div>,
}))
vi.mock('./contract-locations', () => ({ ContractLocations: () => <div>Centros</div> }))

const contract = {
  id: 'contract',
  tenant_id: 'tenant',
  status: 'draft',
  starts_on: '2026-11-13',
  ends_on: '2027-11-18',
  price_cents: 37190,
  billing_frequency: 'monthly',
  notes: 'Acceso por recepción',
  origin_estimate_id: 'estimate',
  updated_at: 'v1',
} as ServiceContract

function render(value = contract, canEdit = true) {
  mocks.cursor = 0
  mocks.edit = undefined
  mocks.form = undefined
  return renderToStaticMarkup(
    <ContractSummary
      contract={value}
      canEdit={canEdit}
      onPrint={() => {}}
      onViewDocument={() => {}}
    >
      <div>Listado de trabajos</div>
    </ContractSummary>,
  )
}

describe('contract summary', () => {
  beforeEach(() => {
    mocks.states = []
  })

  it('guides through basic data, real jobs and activation in order', () => {
    const html = render()
    expect(html.indexOf('Datos básicos')).toBeLessThan(html.indexOf('Configurar trabajos'))
    expect(html.indexOf('Listado de trabajos')).toBeLessThan(html.indexOf('Activación'))
    expect(html.indexOf('Control de estado')).toBeLessThan(html.indexOf('Acciones rápidas'))
    expect(html).not.toContain('order-1')
    expect(html).not.toContain('order-2')
    expect(html).toContain('371,90')
    expect(html).toContain('Acceso por recepción')
    expect(html).toContain('Ver presupuesto aceptado')
    expect(html).not.toContain('Renovación')
    expect(html).not.toContain('Formulario de edición')
  })

  it('opens and closes the editor for a writable draft', () => {
    expect(render()).toContain('Editar datos')
    mocks.edit?.()
    expect(render()).toContain('Formulario de edición')
    mocks.form?.onCancel()
    expect(render()).not.toContain('Formulario de edición')
    mocks.edit?.()
    render()
    mocks.form?.onSaved()
    expect(render()).not.toContain('Formulario de edición')
  })

  it('does not offer editing of active contracts or to read-only users', () => {
    const html = render({ ...contract, status: 'active' })
    expect(html).not.toContain('Editar datos')
    expect(html).toContain('solo se pueden editar antes de activar')
    expect(render(contract, false)).not.toContain('Editar datos')
  })
})
