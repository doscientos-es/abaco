import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServiceContract } from '../application/contract-actions'
import { ApplyContractTemplateButton } from './apply-contract-template-button'

const state = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  ref: { current: new Map<string, string>() },
  lockRef: { current: false },
  select: undefined as ((value: string) => void) | undefined,
  apply: undefined as (() => void) | undefined,
  disabled: false,
  save: vi.fn(),
  invalidate: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => {
    const index = state.cursor++
    if (!(index in state.states)) state.states[index] = initial
    return [
      state.states[index],
      (value: unknown) => {
        state.states[index] = value
      },
    ]
  },
  useRef: (initial: unknown) => (initial === false ? state.lockRef : state.ref),
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({
    children,
    onPress,
    isDisabled,
  }: {
    children: ReactNode
    onPress: () => void
    isDisabled: boolean
  }) => {
    state.apply = onPress
    state.disabled = isDisabled
    return <button disabled={isDisabled}>{children}</button>
  },
  toast: { success: state.success, error: state.error },
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
  useQuery: () => ({
    data: {
      templates: [
        { id: 'template-a', name: 'Primera', revision: 1 },
        { id: 'template-b', name: 'Segunda', revision: 5 },
      ],
    },
  }),
}))
vi.mock('@/shared/ui/form', () => ({
  SelectField: ({
    onChange,
    options,
  }: {
    onChange: (value: string) => void
    options: { value: string; label: string }[]
  }) => {
    state.select = onChange
    return (
      <div>
        {options.map((option) => (
          <span key={option.value}>{option.label}</span>
        ))}
      </div>
    )
  },
}))
vi.mock('../application/contract-template-library-actions', () => ({
  applyLibraryTemplate: state.save,
  loadContractTemplateLibrary: vi.fn(),
}))

const contract = {
  id: 'contract',
  tenant_id: 'tenant',
  updated_at: 'version',
  document_template_id: null,
  document_template_name: null,
} as ServiceContract
function render() {
  state.cursor = 0
  return renderToStaticMarkup(<ApplyContractTemplateButton contract={contract} />)
}

describe('selector de plantilla del contrato', () => {
  beforeEach(() => {
    state.states = []
    state.ref.current.clear()
    state.lockRef.current = false
    vi.clearAllMocks()
    state.invalidate.mockResolvedValue(undefined)
    state.save.mockResolvedValue(undefined)
    vi.stubGlobal('window', { confirm: state.confirm })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('requiere elegir una plantilla y confirmar antes de aplicar su revisión', async () => {
    expect(render()).toContain('Segunda')
    expect(state.disabled).toBe(true)
    state.select?.('template-b')
    render()
    expect(state.disabled).toBe(false)
    state.confirm.mockReturnValueOnce(false)
    state.apply?.()
    expect(state.save).not.toHaveBeenCalled()
    state.confirm.mockReturnValueOnce(true)
    state.apply?.()
    await vi.waitFor(() => expect(state.success).toHaveBeenCalled())
    expect(state.save).toHaveBeenCalledWith({
      tenantId: 'tenant',
      contractId: 'contract',
      templateId: 'template-b',
      templateRevision: 5,
      expectedUpdatedAt: 'version',
      operationId: expect.any(String),
    })
    expect(state.invalidate).toHaveBeenCalledWith({
      queryKey: ['service-contract', 'tenant', 'contract'],
    })
  })

  it('recarga también la biblioteca cuando hay un conflicto', async () => {
    state.save.mockRejectedValueOnce(new Error('La plantilla ha cambiado'))
    state.confirm.mockReturnValue(true)
    render()
    state.select?.('template-a')
    render()
    state.apply?.()
    await vi.waitFor(() =>
      expect(state.invalidate).toHaveBeenCalledWith({
        queryKey: ['contract-template-library', 'tenant'],
      }),
    )
    expect(state.error).toHaveBeenCalled()
  })

  it('ignora confirmaciones rápidas mientras se aplica una plantilla', async () => {
    let finish!: () => void
    state.save.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    state.confirm.mockReturnValue(true)
    render()
    state.select?.('template-a')
    render()
    state.apply?.()
    state.apply?.()
    expect(state.confirm).toHaveBeenCalledTimes(1)
    expect(state.save).toHaveBeenCalledTimes(1)
    finish()
    await vi.waitFor(() => expect(state.success).toHaveBeenCalled())
  })
})
