import { describe, expect, it } from 'vitest'

import { contactWhatsappLink, contactWhatsappNumber, visitMapsLink } from './contact-links'

describe('enlaces de contacto', () => {
  it('normaliza teléfonos españoles y números internacionales explícitos', () => {
    expect(contactWhatsappNumber(' 612 345 678 ')).toBe('34612345678')
    expect(contactWhatsappNumber('34612345678')).toBe('34612345678')
    expect(contactWhatsappNumber('+44 20 7946 0958')).toBe('442079460958')
    expect(contactWhatsappNumber('0049 (30) 1234-5678')).toBe('493012345678')
  })

  it('exige nueve dígitos españoles válidos también con prefijo internacional', () => {
    for (const phone of ['+34 612 345 678', '0034 912 345 678', '34 812 345 678']) {
      expect(contactWhatsappNumber(phone)).toMatch(/^34[6789]\d{8}$/)
    }
    for (const phone of [
      '+34',
      '+34 61234567',
      '+34 6123456789',
      '0034 112345678',
      '0034 61234567',
    ]) {
      expect(contactWhatsappLink(phone)).toBeNull()
    }
  })

  it('rechaza datos vacíos, ambiguos, extensiones y prefijos troncales', () => {
    for (const phone of [
      '',
      '  ',
      '123',
      '1234567890',
      '612345678 ext 1',
      '+44 (0)20 7946 0958',
      '+00000000',
      '+1234567890123456',
      'https://wa.me/12345678',
    ]) {
      expect(contactWhatsappLink(phone)).toBeNull()
    }
  })

  it('solo comparte el número y un mensaje genérico editable', () => {
    const link = contactWhatsappLink('+34 612 345 678')
    if (!link) throw new Error('Falta el enlace de WhatsApp')
    const url = new URL(link)
    expect(url.origin).toBe('https://wa.me')
    expect(url.pathname).toBe('/34612345678')
    expect([...url.searchParams.keys()]).toEqual(['text'])
    expect(url.searchParams.get('text')).toBe(
      'Hola, contactamos contigo en relación con el servicio.',
    )
  })

  it('prioriza coordenadas válidas y recurre a la dirección si son incompletas o inválidas', () => {
    const link = visitMapsLink('Calle incorrecta', { latitude: 40.656, longitude: -4.7 })
    if (!link) throw new Error('Falta el enlace de Maps')
    expect(new URL(link).searchParams.get('destination')).toBe('40.656,-4.7')
    const origin = visitMapsLink('', { latitude: 0, longitude: 0 })
    if (!origin) throw new Error('Falta el enlace de Maps')
    expect(new URL(origin).searchParams.get('destination')).toBe('0,0')
    for (const coordinates of [
      { latitude: null, longitude: -4 },
      { latitude: 91, longitude: 0 },
      { latitude: -90.01, longitude: 0 },
      { latitude: 40, longitude: 180.01 },
      { latitude: NaN, longitude: 0 },
      { latitude: 40, longitude: Infinity },
    ]) {
      const fallback = visitMapsLink('Calle válida', coordinates)
      if (!fallback) throw new Error('Falta la dirección alternativa')
      expect(new URL(fallback).searchParams.get('destination')).toBe('Calle válida')
      expect(visitMapsLink('', coordinates)).toBeNull()
    }
  })

  it('codifica únicamente la dirección de destino en Maps', () => {
    expect(visitMapsLink('  ')).toBeNull()
    expect(visitMapsLink(null)).toBeNull()
    const link = visitMapsLink('  C/ Peñón 4, Ávila & Norte #1  ')
    if (!link) throw new Error('Falta el enlace de Maps')
    const url = new URL(link)
    expect(url.origin).toBe('https://www.google.com')
    expect(url.pathname).toBe('/maps/dir/')
    expect([...url.searchParams.keys()]).toEqual(['api', 'destination'])
    expect(url.searchParams.get('destination')).toBe('C/ Peñón 4, Ávila & Norte #1')
  })
})
