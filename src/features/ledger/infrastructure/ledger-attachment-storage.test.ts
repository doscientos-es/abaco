import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  listLedgerAttachments,
  removeLedgerAttachment,
  uploadLedgerAttachment,
} from './ledger-attachment-storage'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  list: vi.fn(),
  upload: vi.fn(),
  exists: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ storage: { from: mocks.from } }),
}))

const entry = { tenantId: 'tenant-1', id: 'entry-1' }
const receipt = {
  id: '00000000-0000-4000-8000-000000000001',
  file: new File(['%PDF-1.7'], '../../Albarán y factura.html', { type: 'application/pdf' }),
}
const key = `${receipt.id}_Albaran-y-factura.pdf`

beforeEach(() => {
  vi.resetAllMocks()
  mocks.from.mockReturnValue(mocks)
})

describe('ledger attachment storage', () => {
  it('uses an immutable safe filename under the entry and reuses it after a lost response', async () => {
    mocks.upload.mockResolvedValue({ error: { message: 'response unavailable' } })
    mocks.exists.mockResolvedValue({ data: true })
    await uploadLedgerAttachment(entry, receipt)
    expect(mocks.from).toHaveBeenCalledWith('ledger-attachments')
    expect(mocks.upload).toHaveBeenCalledWith(`tenant-1/entry-1/${key}`, receipt.file, {
      contentType: 'application/pdf',
      upsert: false,
    })
    expect(mocks.exists).toHaveBeenCalledWith(`tenant-1/entry-1/${key}`)

    mocks.exists.mockResolvedValue({ data: false })
    await expect(uploadLedgerAttachment(entry, receipt)).rejects.toThrow('No se pudo subir')
  })

  it('lists all pages of files and never treats an empty deletion as success', async () => {
    const firstPage = Array.from({ length: 100 }, () => ({ id: 'object', name: key }))
    mocks.list
      .mockResolvedValueOnce({ error: null, data: firstPage })
      .mockResolvedValueOnce({ error: null, data: [{ id: 'last', name: key }] })
    const attachments = await listLedgerAttachments(entry)
    expect(attachments).toHaveLength(101)
    const lastAttachment = attachments[100]
    expect(lastAttachment).toEqual({ name: 'Albaran-y-factura.pdf', key })
    expect(mocks.list).toHaveBeenLastCalledWith(
      'tenant-1/entry-1',
      expect.objectContaining({ offset: 100 }),
    )
    mocks.remove.mockResolvedValue({ error: null, data: [] })
    if (!lastAttachment) throw new Error('Missing attachment from the second page')
    await expect(removeLedgerAttachment(entry, lastAttachment)).rejects.toThrow(
      'No se pudo eliminar',
    )
    expect(mocks.remove).toHaveBeenCalledWith([`tenant-1/entry-1/${key}`])
  })
})
