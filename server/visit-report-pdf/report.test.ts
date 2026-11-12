import { inflateSync } from 'node:zlib'

import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { projectClosedReport } from './projection'
import { renderVisitReport } from './render'

const tenant = '5c000000-0000-4000-8000-000000000001'
const visit = '5c000000-0000-4000-8000-000000000003'

function version(photo = true) {
  return {
    version: 1,
    closed_at: '2026-10-23T12:00:00Z',
    snapshot: {
      company: { name: 'Empresa', internal_cost: 123 },
      client: { name: 'Álvaro & familia', email: 'private@example.test' },
      visit: { id: visit, title: 'Piscina' },
      report: {
        data: {
          notes: 'Línea larga de intervención. '.repeat(150),
          checklist: [{ label: 'Filtro', done: true }],
        },
      },
      photos: photo
        ? [
            {
              storage_path: `${tenant}/${visit}/image.webp`,
              phase: 'before',
              caption: 'Antes de limpiar',
            },
          ]
        : [],
    },
  }
}

// PDFKit compresses page content; decode text operands in its Flate streams.
function pdfText(pdf: Buffer) {
  const source = pdf.toString('latin1')
  const text: string[] = []
  for (const match of source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      const content = inflateSync(Buffer.from(match[1] ?? '', 'latin1')).toString('latin1')
      for (const hex of content.matchAll(/<([0-9a-f]+)>/gi))
        text.push(Buffer.from(hex[1] ?? '', 'hex').toString('latin1'))
    } catch {
      /* Image and uncompressed streams are not page text. */
    }
  }
  return text.join('')
}

describe('customer PDF', () => {
  it('projects only allowed fields and preserves photo order', () => {
    const { report, photoPaths } = projectClosedReport(version())
    expect(photoPaths).toEqual([`${tenant}/${visit}/image.webp`])
    expect(report.photos[0]).toMatchObject({ phase: 'before', caption: 'Antes de limpiar' })
    expect(JSON.stringify(report)).not.toContain('private@example.test')
    expect(JSON.stringify(report)).not.toContain('internal_cost')
    expect(JSON.stringify(report)).not.toContain('storage_path')
  })

  it('renders a multipage PDF with WebP evidence and customer-safe content', async () => {
    const { report } = projectClosedReport(version())
    const photo = await sharp({
      create: { width: 1000, height: 700, channels: 3, background: '#bdff7b' },
    })
      .webp()
      .toBuffer()
    const pdf = await renderVisitReport(report, [photo])
    const text = pdfText(pdf)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(
      (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length,
    ).toBeGreaterThanOrEqual(2)
    expect(pdf.toString('latin1')).toContain('/Subtype /Image')
    expect(text).toContain('Álvaro & familia')
    expect(text).toContain('Antes de limpiar')
    expect(text).toContain('Página')
    expect(text).not.toContain('private@example.test')
  })

  it('rejects missing, invalid and oversized photos rather than saving incomplete evidence', async () => {
    const { report } = projectClosedReport(version())
    await expect(renderVisitReport(report, [])).rejects.toThrow('Photo count')
    await expect(renderVisitReport(report, [Buffer.from('not an image')])).rejects.toThrow()
    await expect(renderVisitReport(report, [Buffer.alloc(10 * 1024 * 1024 + 1)])).rejects.toThrow(
      'size',
    )
    const invalid = version()
    invalid.snapshot.photos = [{ storage_path: '', phase: 'before', caption: 'Antes' }]
    expect(() => projectClosedReport(invalid)).toThrow('photos')
  })
})
