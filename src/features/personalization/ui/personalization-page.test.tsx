import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PersonalizationPage } from './personalization-page'

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  button: vi.fn(),
  checkbox: vi.fn(),
  field: vi.fn(),
  layoutPicker: vi.fn(),
  patch: vi.fn(),
  navigate: vi.fn(),
  search: vi.fn(),
  tabs: vi.fn(),
  setDocumentType: vi.fn(),
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
  Checkbox: mocks.checkbox,
  PageHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  PageHeaderHeading: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PageHeaderTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  PageHeaderDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Tabs: mocks.tabs,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))
vi.mock('@/shared/ui/form', () => ({
  SelectField: mocks.field,
  TextField: mocks.field,
  TextareaField: mocks.field,
}))
vi.mock(import('@/shared/ui/visual-radio-group'), async (importOriginal) => {
  const { VisualRadioGroup } = await importOriginal()
  return { VisualRadioGroup: mocks.layoutPicker.mockImplementation(VisualRadioGroup) }
})
vi.mock('@/features/estimates', () => import('@/features/estimates/ui/estimate-design-workspace'))
vi.mock('@/features/invoices', () => import('@/features/invoices/ui/invoice-document'))
vi.mock('@/features/clients', () => ({ ClientTypesSection: () => <p>Tipos de cliente</p> }))
vi.mock('@/features/staff-schedules', () => ({ StaffFunctionsSection: () => <p>Funciones</p> }))
vi.mock('@/features/settings/application/settings-actions', () => ({ patchTenant: mocks.patch }))
vi.mock('@/shared/store/store', () => ({
  useTenantData: () => ({
    tenant: { id: 'one', name: 'Empresa', defaultVatRate: 21, emailFromName: 'Equipo' },
  }),
  useSaveStatus: () => ({ state: 'saved' }),
}))

describe('personalization sections', () => {
  let values: unknown[]
  let cursor: number
  let tab: 'marca' | 'documentos' | 'correos' | 'listas'
  function render() {
    cursor = 0
    mocks.button.mockClear()
    mocks.checkbox.mockClear()
    mocks.field.mockClear()
    mocks.layoutPicker.mockClear()
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
      const set = (next: unknown) => {
        values[index] = typeof next === 'function' ? next(values[index]) : next
      }
      if (initial === 'estimate') mocks.setDocumentType.mockImplementation(set)
      return [values[index], set]
    })
    mocks.button.mockImplementation(
      ({ children, isDisabled }: { children: React.ReactNode; isDisabled?: boolean }) => (
        <button disabled={isDisabled}>{children}</button>
      ),
    )
    mocks.field.mockImplementation(({ label }: { label: string }) => <span>{label}</span>)
    mocks.checkbox.mockImplementation(({ children }: { children: React.ReactNode }) => (
      <label>{children}</label>
    ))
    mocks.tabs.mockImplementation(({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ))
  })

  it('keeps messages and configurable lists in their own sections', () => {
    expect(render()).toContain('Identidad de marca')
    tab = 'documentos'
    const documents = render()
    expect(documents).toContain('Diseño de presupuestos')
    expect(documents).not.toContain('Nombre del remitente')
    expect(documents).toContain('Pie de página de los documentos')
    expect(documents).not.toContain('Identidad de marca')
    tab = 'correos'
    const emails = render()
    expect(emails).toContain('Nombre del remitente')
    expect(emails).not.toContain('Pie de página de los documentos')
    tab = 'listas'
    const lists = render()
    expect(lists).toContain('Tipos de cliente')
    expect(lists).toContain('Funciones')
    expect(lists).not.toContain('Guardar personalización')
  })

  it('previews the selected template before saving company design defaults', () => {
    tab = 'documentos'
    const proposal = render()
    expect(proposal).toContain('Vista previa en directo · Documento de ejemplo')
    expect(proposal).toContain('Mostrar índice')
    expect(proposal).toContain('estimate-document__cover')
    expect(proposal).toContain('estimate-document__index')
    mocks.layoutPicker.mock.lastCall?.[0].onChange('compact')
    const compact = render()
    expect(compact).toContain('estimate-document__compact-header')
    expect(compact).not.toContain('Mostrar índice')
    expect(compact).not.toContain('estimate-document__index')
    expect(mocks.patch).not.toHaveBeenCalled()
    const save = mocks.button.mock.calls.find(
      ([props]) => props.children === 'Guardar personalización',
    )?.[0]
    expect(save?.isDisabled).toBe(false)
    save.onPress()
    expect(mocks.patch).toHaveBeenCalledWith({
      defaultEstimateDesign: {
        layout: 'compact',
        showIndex: true,
        showLogo: true,
        showFooter: true,
      },
    })
  })

  it('previews the draft footer only when it is enabled', () => {
    tab = 'documentos'
    render()
    mocks.field.mock.calls
      .find(([props]) => props.label === 'Pie de página de los documentos')?.[0]
      .onChange('  Gracias por confiar en nosotros  ')
    expect(render()).toContain('>Gracias por confiar en nosotros</p>')
    mocks.checkbox.mock.calls
      .find(([props]) => props.children === 'Mostrar texto de pie de página')?.[0]
      .onChange(false)
    expect(render()).not.toContain('Gracias por confiar en nosotros')
    expect(mocks.patch).not.toHaveBeenCalled()
  })

  it('preserves unsaved drafts across tabs and saves only the selected section', () => {
    tab = 'correos'
    render()
    mocks.field.mock.calls
      .find(([props]) => props.label === 'Nombre del remitente')?.[0]
      .onChange('  Nuevo  ')
    tab = 'marca'
    render()
    mocks.field.mock.calls
      .find(([props]) => props.label === 'Logo de la empresa')?.[0]
      .onChange('https://example.test/logo.png')
    tab = 'correos'
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

  it('switches to the real invoice preview and saves its selected layout', () => {
    tab = 'documentos'
    render()
    mocks.setDocumentType('invoice')
    const initial = render()
    expect(initial).toContain('Diseño de facturas')
    expect(initial).toContain('invoice-document invoice-sheet')
    expect(initial).toContain('data-layout="classic"')
    mocks.layoutPicker.mock.lastCall?.[0].onChange('modern')
    expect(render()).toContain('data-layout="modern"')
    mocks.button.mock.calls
      .find(([props]) => props.children === 'Guardar personalización')?.[0]
      .onPress()
    expect(mocks.patch).toHaveBeenCalledWith({ defaultInvoiceDesign: 'modern' })
  })
})
