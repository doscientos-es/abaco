import sharp from 'sharp'

import type { ReportProjection } from './projection'
import { renderVisitReport as render } from './render'
import { MAX_PHOTO_BYTES } from './upstream'

async function preparePhoto(data: Buffer) {
  if (data.length > MAX_PHOTO_BYTES) throw new Error('Photo exceeds the allowed size')
  for (const edge of [1400, 1200, 1000, 850, 700]) {
    for (const quality of [78, 68, 58]) {
      const result = await sharp(data, { limitInputPixels: 40_000_000, failOn: 'error' })
        .rotate()
        .resize(edge, edge, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()
      if (result.length <= 800_000) return result
    }
  }
  throw new Error('Photo could not be prepared for the PDF')
}

export function renderVisitReport(report: ReportProjection, photos: Buffer[]) {
  return render(report, photos, preparePhoto)
}
