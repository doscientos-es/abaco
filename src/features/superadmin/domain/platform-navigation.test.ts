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

  it('preserves company status when opening details but isolates it from other views', () => {
    const result = parsePlatformSearch({ estado: 'attention', q: 'Norte', page: 2 })
    expect(directorySearch(result)).toEqual({ estado: 'attention', q: 'Norte', page: 2 })
    expect(parsePlatformSearch({ ...result, vista: 'resumen' })).toEqual({ vista: 'resumen' })
    expect(parsePlatformSearch({ estado: 'bogus' })).toEqual({})
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

  it('keeps company profile editing scoped to the data section', () => {
    const company = { empresa: 'abc00000-0000-0000-0000-000000000001', q: 'taller', page: 3 }
    const data = { ...company, seccion: 'datos' } as const
    const editing = parsePlatformSearch({ ...data, edicion: 'empresa' })
    expect(editing).toEqual({ ...data, edicion: 'empresa' })
    expect(withoutEditor(editing)).toEqual(data)
    expect(companySectionSearch(editing, 'suscripcion')).toEqual(company)
    expect(parsePlatformSearch({ ...data, edicion: 'cuota' })).toEqual(data)
    expect(parsePlatformSearch({ ...company, edicion: 'empresa' })).toEqual(company)
  })
})

it('preserves directory filters within a company and pins scoped invoices by exact company', () => {
  const empresa = '37b30000-0000-4000-8000-000000000001'
  expect(
    parsePlatformSearch({ empresa, estado: 'archived', periodo: 'year', orden: 'renewal' }),
  ).toEqual({
    empresa,
    estado: 'archived',
    periodo: 'year',
    orden: 'renewal',
  })
  expect(
    parsePlatformSearch({
      vista: 'facturas',
      empresa,
      estado: 'archived',
      periodo: 'year',
      q: 'ML-SUS',
    }),
  ).toEqual({
    vista: 'facturas',
    empresa,
    q: 'ML-SUS',
  })
  expect(parsePlatformSearch({ estado: 'not-a-state', periodo: 'invalid', orden: 'name' })).toEqual(
    {},
  )
})

it('parses an activity link without retaining unrelated company or invoice filters', () => {
  const empresa = '10000000-0000-4000-8000-000000000001'
  expect(
    parsePlatformSearch({
      vista: 'actividad',
      empresa,
      accion: 'iva',
      page: 2,
      seccion: 'pagos',
      factura: 'issued',
    }),
  ).toEqual({ vista: 'actividad', empresa, accion: 'iva', page: 2 })
  expect(
    parsePlatformSearch({
      vista: 'actividad',
      empresa: 'nonsense',
      accion: 'constructor',
      page: 101,
    }),
  ).toEqual({ vista: 'actividad' })
})
