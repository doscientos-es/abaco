import { beforeEach, describe, expect, it, vi } from 'vitest'

import { downloadWorkerDocument, uploadWorkerDocument } from './worker-document-repository'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ storage: { from: mocks.from }, rpc: mocks.rpc }),
}))

const file = new File(['contents'], ' contrato.pdf ', { type: 'application/pdf' })
const input = { tenantId: 'tenant', workerId: 'worker', id: 'document', file }

describe('private worker documents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.from.mockReturnValue({ upload: mocks.upload, download: mocks.download })
    mocks.upload.mockResolvedValue({ error: null })
    mocks.rpc.mockResolvedValue({ error: null })
  })

  it('uploads an immutable private object and registers it against the worker', async () => {
    await uploadWorkerDocument(input)
    expect(mocks.from).toHaveBeenCalledWith('worker-documents')
    expect(mocks.upload).toHaveBeenCalledWith('tenant/worker/document', file, {
      contentType: 'application/pdf',
      upsert: false,
    })
    expect(mocks.rpc).toHaveBeenCalledWith('register_worker_document', {
      p_tenant_id: 'tenant',
      p_worker_id: 'worker',
      p_id: 'document',
      p_name: 'contrato.pdf',
    })
  })

  it('retries registration after an existing upload and propagates registration errors', async () => {
    mocks.upload.mockResolvedValue({ error: { statusCode: '409', message: 'Already exists' } })
    mocks.rpc.mockResolvedValue({ error: { message: 'Registro fallido' } })
    await expect(uploadWorkerDocument(input)).rejects.toThrow('Registro fallido')
    expect(mocks.rpc).toHaveBeenCalledOnce()
  })

  it('rejects invalid files and upload failures before registering', async () => {
    await expect(
      uploadWorkerDocument({ ...input, file: new File(['x'], 'x.txt', { type: 'text/plain' }) }),
    ).rejects.toThrow('PDF')
    await expect(
      uploadWorkerDocument({
        ...input,
        file: new File([], 'empty.pdf', { type: 'application/pdf' }),
      }),
    ).rejects.toThrow('PDF')
    mocks.upload.mockResolvedValue({ error: { statusCode: '403', message: 'Denegado' } })
    await expect(uploadWorkerDocument(input)).rejects.toThrow('Denegado')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('downloads through authenticated storage and surfaces permission errors', async () => {
    const blob = new Blob(['data'])
    mocks.download.mockResolvedValue({ data: blob, error: null })
    expect(await downloadWorkerDocument('tenant/worker/document')).toBe(blob)
    expect(mocks.download).toHaveBeenCalledWith('tenant/worker/document')
    mocks.download.mockResolvedValue({ data: null, error: { message: 'Denegado' } })
    await expect(downloadWorkerDocument('other/document')).rejects.toThrow('Denegado')
  })
})
