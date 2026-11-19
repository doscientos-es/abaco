import { describe, expect, it } from 'vitest'

import { logoUpload, receiptUpload, uploadExtension } from './upload-file'

describe('upload limits', () => {
  it('accepts PDFs for accounting but not logos, and rejects SVGs even with an image extension', () => {
    const pdf = new File(['%PDF-1.7'], 'factura.pdf', { type: 'application/pdf' })
    const svg = new File(['<svg/>'], 'logo.png', { type: 'image/svg+xml' })
    expect(uploadExtension(pdf, receiptUpload)).toBe('pdf')
    expect(() => uploadExtension(pdf, logoUpload)).toThrow('JPG, PNG o WebP')
    expect(() => uploadExtension(svg, logoUpload)).toThrow('JPG, PNG o WebP')
  })

  it('accepts the configured limit and rejects oversized or empty uploads', () => {
    const png = (size: number) =>
      new File([new Uint8Array(size)], 'foto.png', { type: 'image/png' })
    expect(uploadExtension(png(2 * 1024 * 1024), logoUpload)).toBe('png')
    expect(() => uploadExtension(png(2 * 1024 * 1024 + 1), logoUpload)).toThrow('2 MB')
    expect(() => uploadExtension(png(0), receiptUpload)).toThrow('vacío')
  })
})
