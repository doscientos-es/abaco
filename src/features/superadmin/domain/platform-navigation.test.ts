import { describe, expect, it } from 'vitest'

import {
  companyFromInvoice,
  directorySearch,
  invoiceNavigation,
  parsePlatformSearch,
  platformMaxPage,
} from './platform-navigation'

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

  it('keeps invoice filters and pagination separate from the company directory and catalog', () => {
    const result = parsePlatformSearch({
      vista: 'facturas',
      q: ' AB-24 ',
      factura: 'issued',
      page: 2,
    })
    expect(result).toEqual({ vista: 'facturas', q: 'AB-24', factura: 'issued', page: 2 })
    expect(directorySearch(result)).toEqual({})
    expect(
      parsePlatformSearch({ ...result, factura: 'unknown', page: platformMaxPage + 1 }),
    ).toEqual({
      vista: 'facturas',
      q: 'AB-24',
    })
    expect(parsePlatformSearch({ ...result, vista: 'planes' })).toEqual({ vista: 'planes' })
  })

  it('returns from the company to the original invoice result set, even after switching sections', () => {
    const invoices = { vista: 'facturas', q: 'AB-24', factura: 'issued', page: 2 } as const
    const company = companyFromInvoice(invoices, 'abc00000-0000-0000-0000-000000000001')
    const section = parsePlatformSearch({ ...company, seccion: 'modulos' })
    expect(section).toMatchObject({ origen: 'facturas', seccion: 'modulos' })
    expect(invoiceNavigation(section)).toEqual(invoices)
    expect(directorySearch(section)).toEqual({})
  })

  it('keeps numeric references and preserves leading zeros in shared search links', () => {
    expect(parsePlatformSearch({ vista: 'facturas', q: 12345 }).q).toBe('12345')
    expect(parsePlatformSearch({ vista: 'facturas', q: '012345' }).q).toBe('012345')
  })
})
