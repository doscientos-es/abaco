import { describe, expect, it } from 'vitest'

import { directorySearch, parsePlatformSearch, platformMaxPage } from './platform-navigation'

describe('platform search parameters', () => {
  it('keeps the company and section separate from the directory position', () => {
    const id = 'ABC00000-0000-0000-0000-000000000001'
    const result = parsePlatformSearch({ q: '  taller ', page: 3, empresa: id, seccion: 'pagos' })
    expect(result).toEqual({ q: 'taller', page: 3, empresa: id.toLowerCase(), seccion: 'pagos' })
    expect(directorySearch(result)).toEqual({ q: 'taller', page: 3 })
  })

  it('rejects invalid identifiers, unsupported sections and offsets outside the RPC range', () => {
    expect(
      parsePlatformSearch({ empresa: 'taller', seccion: 'pagos', page: platformMaxPage + 1 }),
    ).toEqual({})
    expect(parsePlatformSearch({ seccion: 'modulos', page: 1.5 })).toEqual({})
  })
})
