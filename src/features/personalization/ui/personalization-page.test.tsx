import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PersonalizationPage } from './personalization-page'

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  button: vi.fn(),
  field: vi.fn(),
  patch: vi.fn(),
  navigate: vi.fn(),
  search: vi.fn(),
  tabs: vi.fn(),
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useState: mocks.state,
}))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  useSearch: mocks.search,
}))
vi.mock('@doscientos/ui', () => ({
  Button: mocks.button,
  PageHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  PageHeaderHeading: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PageHeaderTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  PageHeaderDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Tabs: mocks.tabs,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))
vi.mock('@/shared/ui/form', () => ({ TextField: mocks.field, TextareaField: mocks.field }))
vi.mock('@/features/clients', () => ({ ClientTypesSection: () => <p>Tipos de cliente</p> }))
vi.mock('@/features/staff-schedules', () => ({ StaffFunctionsSection: () => <p>Funciones</p> }))
vi.mock('@/features/settings/application/settings-actions', () => ({ patchTenant: mocks.patch }))
vi.mock('@/shared/store/store', () => ({
  useTenantData: () => ({ tenant: { id: 'one', name: 'Empresa', emailFromName: 'Equipo' } }),
}))

describe('personalization sections', () => {
  let values: unknown[]
  let cursor: number
  let tab: 'marca' | 'documentos' | 'listas'
  function render() {
    cursor = 0
    mocks.button.mockClear()
    mocks.field.mockClear()
    return renderToStaticMarkup(<PersonalizationPage />)
  }
  beforeEach(() => {
    vi.clearAllMocks()
    values = []
    cursor = 0
    tab = 'marca'
    mocks.search.mockImplementation(() => ({ tab }))
    mocks.state.mockImplementation((initial: unknown) => {
      const index = cursor++
      if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial
      return [
        values[index],
        (next: unknown) => {
          values[index] = typeof next === 'function' ? next(values[index]) : next
        },
      ]
    })
    mocks.button.mockImplementation(
      ({ children, isDisabled }: { children: React.ReactNode; isDisabled?: boolean }) => (
        <button disabled={isDisabled}>{children}</button>
      ),
    )
    mocks.field.mockImplementation(({ label }: { label: string }) => <span>{label}</span>)
    mocks.tabs.mockImplementation(({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ))
  })

  it('keeps messages and configurable lists in their own sections', () => {
    expect(render()).toContain('Identidad de marca')
    tab = 'documentos'
    const documents = render()
    expect(documents).toContain('Nombre del remitente')
    expect(documents).toContain('Pie de página de los documentos')
    expect(documents).not.toContain('Identidad de marca')
    tab = 'listas'
    const lists = render()
    expect(lists).toContain('Tipos de cliente')
    expect(lists).toContain('Funciones')
    expect(lists).not.toContain('Guardar personalización')
  })

  it('preserves unsaved drafts across tabs and saves only the selected section', () => {
    tab = 'documentos'
    render()
    mocks.field.mock.calls
      .find(([props]) => props.label === 'Nombre del remitente')?.[0]
      .onChange('  Nuevo  ')
    tab = 'marca'
    render()
    mocks.field.mock.calls
      .find(([props]) => props.label === 'Logo de la empresa')?.[0]
      .onChange('https://example.test/logo.png')
    tab = 'documentos'
    render()
    const sender = mocks.field.mock.calls.find(
      ([props]) => props.label === 'Nombre del remitente',
    )?.[0]
    expect(sender?.value).toBe('  Nuevo  ')
    const save = mocks.button.mock.calls.find(
      ([props]) => props.children === 'Guardar personalización',
    )?.[0]
    expect(save?.isDisabled).toBe(false)
    save.onPress()
    expect(mocks.patch).toHaveBeenCalledWith({
      emailFromName: 'Nuevo',
      emailSignature: '',
      estimateEmailIntro: '',
      invoiceEmailIntro: '',
      documentFooter: '',
    })
    tab = 'marca'
    render()
    mocks.button.mock.calls
      .find(([props]) => props.children === 'Guardar personalización')?.[0]
      .onPress()
    expect(mocks.patch).toHaveBeenLastCalledWith({
      brandColor: '',
      logoUrl: 'https://example.test/logo.png',
    })
  })
})
