import { afterEach, describe, expect, it, vi } from 'vitest'

import { SupabaseReportStore } from './upstream'
import { processOnePdfJob, renderPdfJob } from './worker'

const tenant = '5c000000-0000-4000-8000-000000000001'
const version = '5c000000-0000-4000-8000-000000000002'
const visit = '5c000000-0000-4000-8000-000000000003'
const lease = '5c000000-0000-4000-8000-000000000004'
const job = { tenant_id: tenant, report_version_id: version, lease_token: lease }

function fixture(path = `${tenant}/${visit}/photo.jpg`) {
  return {
    version: 1,
    closed_at: '2026-10-25T09:00:00Z',
    snapshot: {
      company: { name: 'Empresa' },
      client: { name: 'Cliente' },
      visit: { id: visit },
      report: { data: { notes: 'Hecho' } },
      photos: [{ storage_path: path, phase: 'before' }],
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('durable PDF worker', () => {
  it('marks an existing PDF ready without regenerating it', async () => {
    const store = new SupabaseReportStore('https://example.test', 'test-key')
    const rpc = vi.spyOn(store, 'rpc').mockResolvedValueOnce([job]).mockResolvedValueOnce(true)
    vi.spyOn(store, 'exists').mockResolvedValue(true)
    const lookup = vi.spyOn(store, 'one')
    expect(await processOnePdfJob(store)).toBe('ready')
    expect(lookup).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenLastCalledWith(
      'finish_service_visit_report_pdf_job',
      expect.objectContaining({ p_ready: true, p_lease_token: lease }),
    )
  })

  it('rejects photos from another visit', async () => {
    const store = new SupabaseReportStore('https://example.test', 'test-key')
    vi.spyOn(store, 'exists').mockResolvedValue(false)
    vi.spyOn(store, 'one').mockResolvedValue(fixture(`${tenant}/other/photo.jpg`))
    const upload = vi.spyOn(store, 'upload')
    await expect(renderPdfJob(store, job)).rejects.toThrow('Photo does not belong')
    expect(upload).not.toHaveBeenCalled()
  })

  it('retries instead of saving a report with a missing photo', async () => {
    const store = new SupabaseReportStore('https://example.test', 'test-key')
    const rpc = vi.spyOn(store, 'rpc').mockResolvedValueOnce([job]).mockResolvedValueOnce(true)
    vi.spyOn(store, 'exists').mockResolvedValue(false)
    vi.spyOn(store, 'one').mockResolvedValue(fixture())
    vi.spyOn(store, 'request').mockResolvedValue({ status: 404, data: Buffer.alloc(0) })
    const upload = vi.spyOn(store, 'upload')
    expect(await processOnePdfJob(store)).toBe('retry')
    expect(upload).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenLastCalledWith(
      'finish_service_visit_report_pdf_job',
      expect.objectContaining({ p_ready: false, p_error_code: 'source_unavailable' }),
    )
  })

  it('renders and uploads the immutable version when no PDF exists', async () => {
    const store = new SupabaseReportStore('https://example.test', 'test-key')
    vi.spyOn(store, 'exists').mockResolvedValue(false)
    const data = fixture()
    data.snapshot.photos = []
    vi.spyOn(store, 'one').mockResolvedValue(data)
    const upload = vi.spyOn(store, 'upload').mockResolvedValue(undefined)
    await renderPdfJob(store, job)
    expect(upload).toHaveBeenCalledOnce()
    expect(upload.mock.calls[0]?.[0]).toBe(`${tenant}/${version}.pdf`)
    expect(upload.mock.calls[0]?.[1].subarray(0, 5).toString()).toBe('%PDF-')
  })
})
