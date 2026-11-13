import type * as React from 'react'
import {
  Children,
  isValidElement,
  type ReactNode,
  type InputHTMLAttributes,
  type ReactElement,
} from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServiceContract } from '../application/contract-actions'
import { ContractActions } from './contract-actions'

type Dialog = {
  open: boolean
  children: ReactElement<{ children: ReactNode }>
  title: string
  onSubmit: () => void
  submitDisabled: boolean
  isSubmitting: boolean
}
const mocks = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  role: 'admin',
  tenantId: 'tenant-1',
  actions: new Map<string, () => void>(),
  dialog: null as Dialog | null,
  changeFile: undefined as InputHTMLAttributes<HTMLInputElement>['onChange'],
  record: vi.fn(),
  invalidate: vi.fn(),
  url: vi.fn(),
  navigate: vi.fn(),
  error: vi.fn(),
}))
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
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
  useRef: (initial: unknown) => {
    const index = mocks.cursor++
    if (!(index in mocks.states)) mocks.states[index] = { current: initial }
    return mocks.states[index]
  },
}))
vi.mock('@doscientos/ui', () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return {
    DropdownMenuTrigger: Container,
    DropdownMenuContent: Container,
    DropdownMenuItem: ({ children, onAction }: { children: ReactNode; onAction: () => void }) => {
      const label = Children.toArray(children)
        .filter((child) => typeof child === 'string')
        .join('')
      mocks.actions.set(label, onAction)
      return <button>{children}</button>
    },
    IconButton: ({ children, label }: { children: ReactNode; label: string }) => (
      <button aria-label={label}>{children}</button>
    ),
    toast: { error: mocks.error },
  }
})
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}))
vi.mock('@/features/auth', () => ({
  useSession: () => ({ role: mocks.role, tenantId: mocks.tenantId }),
  can: (role: string) => role === 'admin',
}))
vi.mock('../application/contract-signature-actions', () => ({
  recordContractSignature: mocks.record,
  signedContractDocumentUrl: mocks.url,
}))
vi.mock('@/shared/ui/form-dialog', () => ({
  FormDialog: (props: Dialog) => {
    mocks.dialog = props
    for (const child of Children.toArray(props.children.props.children)) {
      if (isValidElement<InputHTMLAttributes<HTMLInputElement>>(child) && child.type === 'input')
        mocks.changeFile = child.props.onChange
    }
    return props.open ? (
      <dialog open aria-label={props.title}>
        {props.children}
      </dialog>
    ) : null
  },
}))

const contract = {
  id: 'contract-1',
  tenant_id: 'tenant-1',
  title: 'Limpieza',
  updated_at: 'version-1',
  signed_at: null,
  signed_document_path: null,
} as ServiceContract

function render(overrides: Partial<ServiceContract> = {}) {
  mocks.cursor = 0
  mocks.actions.clear()
  mocks.dialog = null
  return renderToStaticMarkup(<ContractActions contract={{ ...contract, ...overrides }} />)
}
function chooseFile(file: File) {
  mocks.changeFile?.({
    target: { files: [file] },
  } as unknown as React.ChangeEvent<HTMLInputElement>)
}

describe('contract row actions and signature dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.states = []
    mocks.role = 'admin'
    mocks.tenantId = 'tenant-1'
    mocks.record.mockResolvedValue(undefined)
    mocks.invalidate.mockResolvedValue(undefined)
  })

  it('lets the administrator sign without a PDF and refreshes both list and detail', async () => {
    expect(render()).toContain('aria-label="Acciones de Limpieza"')
    mocks.actions.get('Marcar como firmado')?.()
    expect(render()).toContain('PDF firmado (opcional)')
    expect(mocks.dialog?.submitDisabled).toBe(false)
    mocks.dialog?.onSubmit()
    mocks.dialog?.onSubmit()
    await vi.waitFor(() => expect(mocks.invalidate).toHaveBeenCalledTimes(2))
    expect(mocks.record).toHaveBeenCalledExactlyOnceWith({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      expectedUpdatedAt: 'version-1',
      operationId: expect.any(String),
      file: null,
    })
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['service-contracts', 'tenant-1'] })
    expect(mocks.invalidate).toHaveBeenCalledWith({
      queryKey: ['service-contract', 'tenant-1', 'contract-1'],
    })
    await vi.waitFor(() => expect(render()).not.toContain('<dialog'))
  })

  it('allows attaching a PDF later but requires a file for an already signed contract', async () => {
    const signed = { signed_at: '2026-11-13T12:00:00Z' }
    render(signed)
    expect(mocks.actions.has('Marcar como firmado')).toBe(false)
    mocks.actions.get('Adjuntar PDF firmado')?.()
    render(signed)
    expect(mocks.dialog?.submitDisabled).toBe(true)
    mocks.dialog?.onSubmit()
    expect(mocks.record).not.toHaveBeenCalled()
    const file = new File(['%PDF-1.7'], 'Firmado.pdf', { type: 'application/pdf' })
    chooseFile(file)
    render(signed)
    expect(mocks.dialog?.submitDisabled).toBe(false)
    mocks.dialog?.onSubmit()
    await vi.waitFor(() =>
      expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ file })),
    )
  })

  it('retains the PDF and operation identity after a failed registration', async () => {
    mocks.record.mockRejectedValueOnce(new Error('Sin conexión'))
    render()
    mocks.actions.get('Marcar como firmado')?.()
    render()
    const file = new File(['%PDF-1.7'], 'Firmado.pdf', { type: 'application/pdf' })
    chooseFile(file)
    render()
    mocks.dialog?.onSubmit()
    await vi.waitFor(() => expect(render()).toContain('Sin conexión'))
    expect(mocks.dialog?.isSubmitting).toBe(false)
    mocks.dialog?.onSubmit()
    await vi.waitFor(() => expect(mocks.record).toHaveBeenCalledTimes(2))
    expect(mocks.record.mock.calls[0]).toEqual(mocks.record.mock.calls[1])
    expect(mocks.record.mock.calls[1]?.[0].file).toBe(file)
  })

  it.each(['user', 'other-tenant'])('does not expose signing or document actions to %s', (kind) => {
    if (kind === 'user') mocks.role = 'user'
    else mocks.tenantId = 'other-tenant'
    render()
    expect([...mocks.actions.keys()]).toEqual(['Ver contrato'])
    render({ signed_at: '2026-11-13T12:00:00Z', signed_document_path: 'private/path.pdf' })
    expect([...mocks.actions.keys()]).toEqual(['Ver contrato'])
  })

  it('opens the attached PDF without offering replacement or another signature', async () => {
    const tab = { opener: {}, location: { replace: vi.fn() }, close: vi.fn() }
    const open = vi.fn(() => tab)
    vi.stubGlobal('window', { open })
    mocks.url.mockResolvedValue('private-document-url')
    try {
      render({ signed_at: '2026-11-13T12:00:00Z', signed_document_path: 'private/path.pdf' })
      expect([...mocks.actions.keys()]).toEqual(['Ver contrato', 'Ver PDF firmado'])
      mocks.actions.get('Ver PDF firmado')?.()
      await vi.waitFor(() =>
        expect(tab.location.replace).toHaveBeenCalledWith('private-document-url'),
      )
      expect(mocks.url).toHaveBeenCalledWith('private/path.pdf')
      expect(tab.opener).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
