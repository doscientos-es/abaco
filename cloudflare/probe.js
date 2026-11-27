import { projectClosedReport } from '../server/visit-report-pdf/projection'
import { renderVisitReport } from '../server/visit-report-pdf/render'

export default {
  async fetch() {
    const tenant = '5c000000-0000-4000-8000-000000000001'
    const visit = '5c000000-0000-4000-8000-000000000003'
    const { report } = projectClosedReport({
      version: 1,
      closed_at: '2026-10-23T12:00:00Z',
      snapshot: {
        company: { name: 'Test' },
        client: { name: 'Test' },
        visit: { id: visit, title: 'Test' },
        report: { data: { notes: 'Test' } },
        photos: [
          { storage_path: `${tenant}/${visit}/image.png`, phase: 'before', caption: 'Test' },
        ],
      },
    })
    const image = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWNYffb96rPvGSAUAEJCCZ0WY1CJAAAAAElFTkSuQmCC',
      'base64',
    )
    try {
      const pdf = await renderVisitReport(report, [image])
      return new Response(pdf, { headers: { 'content-type': 'application/pdf' } })
    } catch (error) {
      return new Response(String(error.stack || error), { status: 500 })
    }
  },
}
