import { afterEach, describe, expect, it, vi } from 'vitest'

import { projectClosedReport } from './projection'
import { createOrGetPdf } from './public'
import { SupabaseReportStore, UpstreamError } from './upstream'

const share = {
  tenant_id: '11111111-1111-1111-1111-111111111111',
  report_version_id: '22222222-2222-2222-2222-222222222222',
  expires_at: '2099-01-01T00:00:00Z',
  revoked_at: null,
}
const token = 'a'.repeat(64)

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('public PDF download', () => {
  it('reuses the saved version and checks the share again before returning its URL', async () => {
    const store = new SupabaseReportStore('https://example.test', 'test-key')
    const lookup = vi.spyOn(store, 'one').mockResolvedValue(share)
    vi.spyOn(store, 'exists').mockResolvedValue(true)
    vi.spyOn(store, 'json').mockResolvedValue({
      status: 200,
      data: { signedURL: '/object/sign/visit-report-pdfs/report.pdf?token=test' },
    })
    const url = await createOrGetPdf(token, store)
    expect(url).toBe(
      'https://example.test/storage/v1/object/sign/visit-report-pdfs/report.pdf?token=test&download=parte-de-visita.pdf',
    )
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('rejects a share revoked while the PDF was being prepared', async () => {
    const store = new SupabaseReportStore('https://example.test', 'test-key')
    vi.spyOn(store, 'one').mockResolvedValueOnce(share).mockResolvedValueOnce(null)
    vi.spyOn(store, 'exists').mockResolvedValue(true)
    vi.spyOn(store, 'json').mockResolvedValue({
      status: 200,
      data: { signedURL: '/object/sign/visit-report-pdfs/report.pdf' },
    })
    await expect(createOrGetPdf(token, store)).rejects.toMatchObject({ status: 404 })
  })

  it('rejects expired shares before accessing storage', async () => {
    const store = new SupabaseReportStore('https://example.test', 'test-key')
    vi.spyOn(store, 'one').mockResolvedValue({ ...share, expires_at: '2000-01-01T00:00:00Z' })
    const exists = vi.spyOn(store, 'exists')
    await expect(createOrGetPdf(token, store)).rejects.toMatchObject({ status: 404 })
    expect(exists).not.toHaveBeenCalled()
  })

  it('never sends the service credential to a foreign photo URL', async () => {
    const store = new SupabaseReportStore('https://example.test', 'test-key')
    vi.spyOn(store, 'one')
      .mockResolvedValueOnce(share)
      .mockResolvedValueOnce({ snapshot: { photos: [{}] } })
    vi.spyOn(store, 'exists').mockResolvedValue(false)
    vi.spyOn(store, 'json').mockResolvedValue({
      status: 200,
      data: { photos: [{ url: 'https://evil.test/storage/v1/object/sign/visit-photos/a' }] },
    })
    const request = vi.spyOn(store, 'request')
    await expect(createOrGetPdf(token, store)).rejects.toBeInstanceOf(UpstreamError)
    expect(request).not.toHaveBeenCalled()
  })

  it('rejects missing public photos rather than creating an incomplete PDF', async () => {
    const store = new SupabaseReportStore('https://example.test', 'test-key')
    vi.spyOn(store, 'one')
      .mockResolvedValueOnce(share)
      .mockResolvedValueOnce({ snapshot: { photos: [{}] } })
    vi.spyOn(store, 'exists').mockResolvedValue(false)
    vi.spyOn(store, 'json').mockResolvedValue({ status: 200, data: { photos: [] } })
    const upload = vi.spyOn(store, 'upload')
    await expect(createOrGetPdf(token, store)).rejects.toBeInstanceOf(UpstreamError)
    expect(upload).not.toHaveBeenCalled()
  })

  it('generates and stores a missing report before returning the temporary link', async () => {
    const store = new SupabaseReportStore('https://example.test', 'test-key')
    const { report } = projectClosedReport({
      version: 1,
      closed_at: '2026-10-23T12:00:00Z',
      snapshot: {
        company: { name: 'Empresa' },
        client: { name: 'Cliente' },
        visit: { title: 'Visita' },
        report: { data: {} },
        photos: [],
      },
    })
    vi.spyOn(store, 'one')
      .mockResolvedValueOnce(share)
      .mockResolvedValueOnce({ snapshot: { photos: [] } })
      .mockResolvedValueOnce(share)
    vi.spyOn(store, 'exists').mockResolvedValue(false)
    vi.spyOn(store, 'json')
      .mockResolvedValueOnce({ status: 200, data: report })
      .mockResolvedValueOnce({
        status: 200,
        data: { signedURL: '/object/sign/visit-report-pdfs/report.pdf' },
      })
    const upload = vi.spyOn(store, 'upload').mockResolvedValue(undefined)
    expect(await createOrGetPdf(token, store)).toContain(
      '/object/sign/visit-report-pdfs/report.pdf?download=',
    )
    expect(upload).toHaveBeenCalledOnce()
    expect(upload.mock.calls[0]?.[1].subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('limits upstream data, refuses external destinations and classifies network errors as transient', async () => {
    const store = new SupabaseReportStore('https://example.test', 'test-key')
    const fetchMock = vi.fn().mockResolvedValue(new Response('12345'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(store.request('/large', { limit: 4 })).rejects.toBeInstanceOf(UpstreamError)
    await expect(store.request('https://evil.test/photo')).rejects.toBeInstanceOf(UpstreamError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockRejectedValue(new Error('network'))
    await expect(store.request('/photo')).rejects.toBeInstanceOf(UpstreamError)
  })
})
