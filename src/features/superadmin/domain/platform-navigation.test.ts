import { describe, expect, it } from 'vitest'

import {
  companyBackSearch,
  companyFromInvoice,
  companySectionSearch,
  directorySearch,
  invoiceNavigation,
  parsePlatformSearch,
  platformMaxPage,
  withoutEditor,
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

  it('returns from the company to the original invoice detail, even after switching sections', () => {
    const invoices = { vista: 'facturas', q: 'AB-24', factura: 'issued', page: 2 } as const
    const detail = { ...invoices, referencia: '0123X9Ab' }
    const company = companyFromInvoice(detail, 'abc00000-0000-0000-0000-000000000001')
    const section = parsePlatformSearch({ ...company, seccion: 'modulos' })
    expect(section).toMatchObject({ origen: 'facturas', seccion: 'modulos' })
    expect(companyBackSearch(section)).toEqual(detail)
    expect(invoiceNavigation(section)).toEqual(invoices)
    expect(directorySearch(section)).toEqual({})
  })

  it('keeps numeric references and preserves leading zeros in shared search links', () => {
    expect(parsePlatformSearch({ vista: 'facturas', q: 12345 }).q).toBe('12345')
    expect(parsePlatformSearch({ vista: 'facturas', q: '012345' }).q).toBe('012345')
    expect(parsePlatformSearch({ vista: 'facturas', referencia: 12345678 }).referencia).toBe(
      '12345678',
    )
    expect(parsePlatformSearch({ vista: 'facturas', referencia: '01234567' }).referencia).toBe(
      '01234567',
    )
    expect(parsePlatformSearch({ vista: 'facturas', referencia: 'not-an-order' })).toEqual({
      vista: 'facturas',
    })
  })

  it('validates catalog editors against the selected plan', () => {
    const list = { vista: 'planes' }
    expect(parsePlatformSearch({ ...list, plan: 'team', edicion: 'plan', q: 'old' })).toEqual({
      ...list,
      plan: 'team',
      edicion: 'plan',
    })
    expect(parsePlatformSearch({ ...list, plan: 'trial', edicion: 'plan' })).toEqual(list)
  })

  it('scopes editors to their section and preserves the directory when leaving a module', () => {
    const company = { empresa: 'abc00000-0000-0000-0000-000000000001', q: 'taller', page: 3 }
    const modules = { ...company, seccion: 'modulos' }
    const detail = { ...modules, modulo: 'procurement' }
    const editing = parsePlatformSearch({ ...detail, edicion: 'modulo' })
    expect(editing).toEqual({ ...detail, edicion: 'modulo' })
    expect(withoutEditor(editing)).toEqual(detail)
    expect(companySectionSearch(editing, 'suscripcion')).toEqual(company)
    expect(parsePlatformSearch({ ...modules, modulo: 'toString', edicion: 'modulo' })).toEqual(
      modules,
    )
    expect(parsePlatformSearch({ ...company, seccion: 'pagos', edicion: 'cuota' })).toEqual({
      ...company,
      seccion: 'pagos',
    })
  })
})
