import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createReceiptAnalysis } from './receipt-analysis'

const mocks = vi.hoisted(() => ({ document: vi.fn(), request: vi.fn() }))
vi.mock('./ai-actions', () => ({ aiDocument: mocks.document, requestSuggestion: mocks.request }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const file = {} as File
const doc = { mimeType: 'application/pdf', data: 'abc' }
const suggestion = { date: null, concept: 'Cable', category: null, grossCents: 1210, vatRate: 21 }

beforeEach(() => {
  mocks.document.mockReset().mockResolvedValue(doc)
  mocks.request.mockReset().mockResolvedValue(suggestion)
})

describe('receipt analysis', () => {
  it('returns the validated suggestion for the selected tenant', async () => {
    const result = await createReceiptAnalysis('tenant').analyze(file)
    expect(result).toEqual({ status: 'success', suggestion })
    expect(mocks.request).toHaveBeenCalledWith('tenant', { task: 'receipt', document: doc })
  })

  it('does not send a file whose reading finished after cancellation', async () => {
    const reading = deferred<typeof doc>()
    mocks.document.mockReturnValueOnce(reading.promise)
    const analyzer = createReceiptAnalysis('tenant')
    const pending = analyzer.analyze(file)
    analyzer.cancel()
    reading.resolve(doc)
    await expect(pending).resolves.toEqual({ status: 'obsolete' })
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('ignores a previous response after another file has been selected', async () => {
    const first = deferred<typeof suggestion>()
    mocks.request.mockReturnValueOnce(first.promise)
    const analyzer = createReceiptAnalysis('tenant')
    const pending = analyzer.analyze(file)
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1))
    await expect(analyzer.analyze(file)).resolves.toEqual({ status: 'success', suggestion })
    first.resolve({ ...suggestion, concept: 'Obsoleto' })
    await expect(pending).resolves.toEqual({ status: 'obsolete' })
  })

  it('reports failures and ignores cancelled failures', async () => {
    mocks.document.mockRejectedValueOnce(new Error('Archivo demasiado grande'))
    const analyzer = createReceiptAnalysis('tenant')
    await expect(analyzer.analyze(file)).resolves.toEqual({
      status: 'error',
      message: 'Archivo demasiado grande',
    })
    const pending = deferred<typeof doc>()
    mocks.document.mockReturnValueOnce(pending.promise)
    const result = analyzer.analyze(file)
    analyzer.cancel()
    pending.resolve(doc)
    await expect(result).resolves.toEqual({ status: 'obsolete' })
  })
})
