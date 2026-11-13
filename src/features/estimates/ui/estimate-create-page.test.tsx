import type { FormEvent, ReactElement } from 'react'
import type * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  synchronize: vi.fn(),
  submit: vi.fn(),
  setters: [] as ReturnType<typeof vi.fn>[],
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useEffect: vi.fn(),
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => {
    const setter = vi.fn()
    mocks.setters.push(setter)
    return [typeof initial === 'function' ? initial() : initial, setter]
  },
}))
vi.mock('@tanstack/react-router', () => ({ useBlocker: vi.fn(), useNavigate: () => vi.fn() }))
vi.mock('@/shared/store/store', () => ({
  synchronizeStoreSaves: mocks.synchronize,
  newId: () => crypto.randomUUID(),
  useSaveStatus: () => ({ state: 'saved' }),
  useTenantData: () => ({
    tenant: {
      id: 'tenant',
      name: 'Empresa',
      defaultVatRate: 21,
      defaultDepositPercent: 30,
      nextEstimateNumber: 1,
    },
  }),
}))
vi.mock('../application/estimate-actions', () => ({ submitEstimateDraft: mocks.submit }))
vi.mock('./estimate-editor-page', () => ({ EstimateEditorPage: () => null }))
vi.mock('./estimate-draft-context', () => ({ EstimateDraftProvider: () => null }))

import { EstimateCreatePage } from './estimate-create-page'

afterEach(() => vi.unstubAllGlobals())

function form() {
  const tree = EstimateCreatePage({ clientId: 'client', title: 'Nuevo' }) as ReactElement<{
    children: ReactElement<{ onSubmit: (event: FormEvent<HTMLFormElement>) => void }>
  }>
  const target = { reportValidity: () => true }
  const event = {
    target,
    currentTarget: target,
    preventDefault: vi.fn(),
  } as unknown as FormEvent<HTMLFormElement>
  return { submit: () => tree.props.children.props.onSubmit(event) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.setters = []
  mocks.synchronize.mockResolvedValue(undefined)
  vi.stubGlobal('document', { activeElement: null })
  vi.stubGlobal('HTMLElement', class {})
})

describe('creation synchronization', () => {
  it('waits for pending changes before creating the estimate, including repeated clicks', async () => {
    let resolve!: () => void
    mocks.synchronize.mockReturnValueOnce(
      new Promise<void>((done) => {
        resolve = done
      }),
    )
    const page = form()
    page.submit()
    page.submit()
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.synchronize).toHaveBeenCalledOnce()
    resolve()
    await vi.waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce())
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Nuevo', clientId: 'client' }),
    )
  })

  it('keeps the unsubmitted draft and displays the real error when synchronization fails', async () => {
    mocks.synchronize.mockRejectedValueOnce(new Error('Sin conexión al servidor'))
    const page = form()
    page.submit()
    await vi.waitFor(() =>
      expect(mocks.setters[3]).toHaveBeenLastCalledWith('Sin conexión al servidor'),
    )
    expect(mocks.submit).not.toHaveBeenCalled()
    page.submit()
    await vi.waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce())
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nuevo' }))
  })

  it('does not create the document again when retrying its own save', async () => {
    const page = form()
    page.submit()
    await vi.waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce())
    page.submit()
    await vi.waitFor(() => expect(mocks.setters[2]).toHaveBeenLastCalledWith(false))
    expect(mocks.submit).toHaveBeenCalledOnce()
    expect(mocks.synchronize).toHaveBeenCalledTimes(2)
  })
})
