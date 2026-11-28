import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { VisitPhotosPanel } from './visit-photos-panel'

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({ data: [], isPending: false, isError: false }),
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({ children, isDisabled }: { children: ReactNode; isDisabled?: boolean }) => (
    <button disabled={isDisabled}>{children}</button>
  ),
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../application/visit-photo-actions', () => ({
  listVisitPhotos: vi.fn(),
  photoExtension: vi.fn(),
  uploadVisitPhoto: vi.fn(),
}))

describe('VisitPhotosPanel', () => {
  const render = (closed: boolean) =>
    renderToStaticMarkup(
      <VisitPhotosPanel tenantId="tenant" visitId="visit" userId="user" closed={closed} />,
    )

  it('offers direct camera capture and a separate picker for existing images', () => {
    const html = render(false)
    expect(html).toContain('Hacer foto')
    expect(html).toContain('Elegir una imagen')
    expect(html).toContain('type="file"')
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"')
    expect(html.match(/capture="environment"/g)).toHaveLength(1)
    expect(html.match(/type="file"/g)).toHaveLength(2)
    expect(html).toContain('Preparar fotografía')
  })

  it('does not offer a photo picker for a closed visit', () => {
    expect(render(true)).not.toContain('type="file"')
  })
})
