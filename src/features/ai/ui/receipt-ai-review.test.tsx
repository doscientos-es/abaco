import type React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cursor: 0,
  states: [] as unknown[],
  select: undefined as ((file: File | null) => void) | undefined,
  retry: undefined as (() => void) | undefined,
  analyze: vi.fn(),
  cancel: vi.fn(),
  invalidate: vi.fn(),
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
  Button: ({ children, onPress }: { children: React.ReactNode; onPress: () => void }) => {
    mocks.retry = onPress
    return <button>{children}</button>
  },
}))
vi.mock('@/shared/ui/upload-file-field', () => ({
  UploadFileField: ({ onChange }: { onChange: (file: File | null) => void }) => {
    mocks.select = onChange
    return <div>Adjuntar</div>
  },
}))
vi.mock('../application/receipt-analysis', () => ({
  createReceiptAnalysis: () => ({ analyze: mocks.analyze, cancel: mocks.cancel }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}))

import { ReceiptAiReview } from './receipt-ai-review'

const file = { name: 'factura.pdf' } as File
const suggestion = { date: null, concept: 'Cable', category: null, grossCents: 1210, vatRate: null }
const props = {
  tenantId: 'tenant',
  file: null as File | null,
  canAnalyze: true,
  checkingAccess: false,
  onFileChange: vi.fn(),
  onApply: vi.fn(),
  onBusyChange: vi.fn(),
  onAnalysisStart: vi.fn(),
}

function render(overrides: Partial<typeof props> = {}) {
  mocks.cursor = 0
  mocks.retry = undefined
  return renderToStaticMarkup(<ReceiptAiReview {...props} {...overrides} />)
}

beforeEach(() => {
  mocks.states = []
  mocks.select = undefined
  mocks.analyze.mockReset().mockResolvedValue({ status: 'success', suggestion })
  mocks.cancel.mockReset()
  mocks.invalidate.mockReset()
  props.onFileChange.mockReset()
  props.onApply.mockReset()
  props.onBusyChange.mockReset()
  props.onAnalysisStart.mockReset()
})

describe('receipt autofill', () => {
  it('automatically analyzes a selected file and asks the user to review missing VAT', async () => {
    expect(render()).toContain('se consumirá una solicitud')
    mocks.select?.(file)
    expect(props.onFileChange).toHaveBeenCalledWith(file)
    expect(mocks.analyze).toHaveBeenCalledWith(file)
    expect(props.onBusyChange).toHaveBeenLastCalledWith(true)
    await vi.waitFor(() => expect(props.onApply).toHaveBeenCalledWith(suggestion))
    expect(props.onBusyChange).toHaveBeenLastCalledWith(false)
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['ai-credits', 'tenant'] })
    expect(render({ file })).toContain('El libro solo admite un tipo')
  })

  it('allows manual attachments without AI access', () => {
    expect(render({ canAnalyze: false })).toContain('manualmente')
    mocks.select?.(file)
    expect(props.onFileChange).toHaveBeenCalledWith(file)
    expect(mocks.analyze).not.toHaveBeenCalled()
  })

  it('shows errors and allows retry without applying a failed result', async () => {
    mocks.analyze.mockResolvedValueOnce({ status: 'error', message: 'Sin créditos' })
    render()
    mocks.select?.(file)
    await vi.waitFor(() => expect(render({ file })).toContain('Sin créditos'))
    expect(props.onApply).not.toHaveBeenCalled()
    expect(render({ file })).toContain('Analizar de nuevo')
    mocks.retry?.()
    await vi.waitFor(() => expect(props.onApply).toHaveBeenCalledWith(suggestion))
    expect(mocks.analyze).toHaveBeenCalledTimes(2)
  })
})
