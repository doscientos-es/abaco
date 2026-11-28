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
  tabsContent: vi.fn(),
  uploadLogo: vi.fn(),
  uploadField: vi.fn(),
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
  TabsContent: mocks.tabsContent,
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
vi.mock('@/features/visits', () => ({
  VisitReportTemplateLibrary: () => <p>Plantillas de parte por servicio</p>,
}))
vi.mock('@/features/settings/application/settings-actions', () => ({ patchTenant: mocks.patch }))
vi.mock('../application/brand-logo-actions', () => ({ uploadBrandLogo: mocks.uploadLogo }))
vi.mock(import('@/shared/ui/upload-file-field'), async (importOriginal) => {
  const { UploadFileField } = await importOriginal()
  return {
    UploadFileField: (props: React.ComponentProps<typeof UploadFileField>) => {
      mocks.uploadField(props)
      return <span>{props.label}</span>
    },
  }
})
vi.mock('@/shared/store/store', () => ({
  currentTenantData: () => ({ tenant: { id: 'one' } }),
  useTenantData: () => ({
    tenant: { id: 'one', name: 'Empresa', defaultVatRate: 21, emailFromName: 'Equipo' },
  }),
  useSaveStatus: () => ({ state: 'saved' }),
}))

describe('personalization sections', () => {
  let values: Map<string, unknown>
  let scope: string
  let cursors: Map<string, number>
  let tab: 'marca' | 'documentos' | 'correos' | 'listas'
  function ScopeEnter({ id }: { id: string }) {
    scope = id
    return null
  }
  function ScopeExit() {
    scope = 'root'
    return null
  }
  function render() {
    scope = 'root'
    cursors = new Map()
    mocks.button.mockClear()
    mocks.checkbox.mockClear()
    mocks.field.mockClear()
    mocks.layoutPicker.mockClear()
    mocks.tabs.mockClear()
    return renderToStaticMarkup(<PersonalizationPage />)
  }
  function changeField(label: string, value: string) {
    const field = mocks.field.mock.calls.find(([props]) => props.label === label)?.[0]
    expect(field).toBeDefined()
    field.onChange(value)
  }
  beforeEach(() => {
    vi.clearAllMocks()
    values = new Map()
    scope = 'root'
    cursors = new Map()
    tab = 'marca'
    mocks.search.mockImplementation(() => ({ tab }))
    mocks.state.mockImplementation((initial: unknown) => {
      const index = cursors.get(scope) ?? 0
      cursors.set(scope, index + 1)
      const key = `${scope}:${index}`
      if (!values.has(key)) values.set(key, typeof initial === 'function' ? initial() : initial)
      const set = (next: unknown) => {
        values.set(key, typeof next === 'function' ? next(values.get(key)) : next)
      }
      return [values.get(key), set]
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
    mocks.tabsContent.mockImplementation(
      ({ id, children }: { id?: string; children: React.ReactNode }) => (
        <div>
          <ScopeEnter id={id ?? 'root'} />
          {children}
          <ScopeExit />
        </div>
      ),
    )
  })

  it('keeps messages and configurable lists in their own sections', () => {
    const identity = render()
    expect(identity).toContain('Identidad de marca')
    expect(identity).toMatch(
      /<aside[^>]*aria-label="Personalizar identidad".*?<footer[^>]*>.*Guardar personalización/,
    )
    tab = 'documentos'
    const documents = render()
    expect(documents).toContain('Diseño de presupuestos')
    expect(documents).toContain('Plantillas de parte por servicio')
    expect(identity).not.toContain('Plantillas de parte por servicio')
    expect(documents).not.toContain('Nombre del remitente')
    expect(documents).toContain('Pie de página de los documentos')
    expect(documents).not.toContain('Identidad de marca')
    tab = 'correos'
    const emails = render()
    expect(emails).toContain('Nombre del remitente')
    expect(emails).toMatch(
      /<aside[^>]*aria-label="Personalizar correo".*?<footer[^>]*>.*Guardar personalización/,
    )
    expect(emails).not.toContain('Pie de página de los documentos')
    tab = 'listas'
    const lists = render()
    expect(lists).toContain('Tipos de cliente')
    expect(lists).toContain('Funciones')
    expect(lists).not.toContain('Guardar personalización')
  })

  it('applies the draft color and logo to the sample workspace without saving', () => {
    expect(render()).toContain('Nuevo presupuesto')
    expect(render()).not.toContain('Vista previa en directo')
    changeField('Color hexadecimal', '#AAAAAA')
    changeField('Logo de la empresa', 'https://example.test/logo.png')
    const customized = render()
    expect(customized).toContain('--primary:#AAAAAA;--primary-foreground:#000000')
    expect(customized).toContain('src="https://example.test/logo.png"')
    expect(mocks.patch).not.toHaveBeenCalled()

    changeField('Logo de la empresa', 'http://example.test/logo.png')
    expect(render()).not.toContain('src="http://example.test/logo.png"')
    const save = mocks.button.mock.calls.find(
      ([props]) => props.children === 'Guardar personalización',
    )?.[0]
    expect(save?.isDisabled).toBe(true)
  })

  it('uploads the logo only on save and keeps a failed selection available for retry', async () => {
    const logo = new File(['image'], 'logo.png', { type: 'image/png' })
    const url = 'https://storage.example.test/logo.png'
    mocks.uploadLogo
      .mockRejectedValueOnce(new Error('No se pudo subir el logo'))
      .mockResolvedValueOnce(url)
    expect(render()).toContain('Subir logo de la empresa')
    mocks.uploadField.mock.lastCall?.[0].onChange(logo)
    expect(render()).toContain('src="blob:')
    const save = () =>
      mocks.button.mock.calls.find(([props]) => props.children === 'Guardar personalización')?.[0]
    expect(save()?.isDisabled).toBe(false)
    expect(mocks.uploadLogo).not.toHaveBeenCalled()

    save()?.onPress()
    await Promise.resolve()
    expect(render()).toContain('No se pudo subir el logo')
    expect(mocks.patch).not.toHaveBeenCalled()

    save()?.onPress()
    await Promise.resolve()
    expect(mocks.uploadLogo).toHaveBeenLastCalledWith('one', logo)
    expect(mocks.patch).toHaveBeenCalledWith({ brandColor: '', logoUrl: url })
    expect(render()).toContain(`src="${url}"`)
  })

  it('previews both email drafts with shared sender and signature and separate messages', () => {
    tab = 'correos'
    expect(render()).toContain('Presupuesto DEMO-001 · Empresa')
    changeField('Nombre del remitente', 'Equipo comercial')
    changeField('Firma del correo', 'Saludos del equipo')
    changeField('Mensaje en correos de presupuesto', 'Tu <propuesta> personalizada')
    const estimate = render()
    expect(estimate).not.toContain('Vista previa en directo')
    expect(estimate).not.toContain('Correo de ejemplo')
    expect(estimate).toContain('>Equipo comercial</dd>')
    expect(estimate).toContain('Tu &lt;propuesta&gt; personalizada')
    expect(estimate).toContain('Saludos del equipo')

    const typeTabs = mocks.tabs.mock.calls.find(([props]) => props.selectedKey === 'estimate')?.[0]
    typeTabs.onSelectionChange('invoice')
    expect(render()).toContain('Factura DEMO-001 · Empresa')
    changeField('Mensaje en correos de factura', 'Tu factura personalizada')
    const invoice = render()
    expect(invoice).not.toContain('Vista previa en directo')
    expect(invoice).not.toContain('Correo de ejemplo')
    expect(invoice).toContain('Tu factura personalizada')
    expect(invoice).not.toContain('Tu &lt;propuesta&gt; personalizada')
    expect(invoice).toContain('>Equipo comercial</dd>')
    expect(invoice).toContain('Saludos del equipo')
    expect(mocks.patch).not.toHaveBeenCalled()

    mocks.button.mock.calls
      .find(([props]) => props.children === 'Guardar personalización')?.[0]
      .onPress()
    expect(mocks.patch).toHaveBeenCalledWith({
      emailFromName: 'Equipo comercial',
      emailSignature: 'Saludos del equipo',
      estimateEmailIntro: 'Tu <propuesta> personalizada',
      invoiceEmailIntro: 'Tu factura personalizada',
    })
  })

  it('previews the selected template without a caption and saves from the drawer footer', () => {
    tab = 'documentos'
    const proposal = render()
    expect(proposal).toContain('>Presupuesto</span>')
    expect(proposal).toContain('>Factura</span>')
    expect(proposal).not.toContain('Vista previa en directo')
    expect(proposal).not.toContain('Documento de ejemplo')
    expect(proposal).not.toContain('<details')
    const drawer = proposal.match(
      /<aside[^>]*aria-label="Personalizar documento"[^>]*>.*?<\/aside>/,
    )?.[0]
    expect(drawer).toMatch(/<footer[^>]*>.*Guardar personalización.*<\/footer>/)
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
    const documentTabs = mocks.tabs.mock.calls.find(([props]) => props.selectedKey === 'estimate')
    expect(documentTabs).toBeDefined()
    documentTabs?.[0].onSelectionChange('invoice')
    const initial = render()
    expect(initial).toContain('Diseño de facturas')
    expect(initial).toContain('invoice-document invoice-sheet')
    expect(initial).toContain('data-layout="classic"')
    expect(initial).not.toContain('Documento de ejemplo')
    const picker = mocks.layoutPicker.mock.lastCall?.[0]
    expect(picker.options).toContainEqual(
      expect.objectContaining({ value: 'artistic', label: 'Artística' }),
    )
    picker.onChange('artistic')
    expect(render()).toContain('data-layout="artistic"')
    mocks.button.mock.calls
      .find(([props]) => props.children === 'Guardar personalización')?.[0]
      .onPress()
    expect(mocks.patch).toHaveBeenCalledWith({ defaultInvoiceDesign: 'artistic' })
  })
})
