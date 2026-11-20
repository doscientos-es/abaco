/** Only accept unambiguous international numbers or nine-digit Spanish numbers. */
export function contactWhatsappNumber(phone: string | null | undefined): string | null {
  const value = phone?.trim() ?? ''
  if (!value || !/^(?:\+|00)?[\d\s().-]+$/.test(value)) return null

  const international = value.startsWith('+') || value.startsWith('00')
  // An optional national trunk prefix must not be silently included in an international number.
  if (international && /\(\s*0\s*\)/.test(value)) return null
  let digits = value.replace(/\D/g, '')
  if (value.startsWith('00')) digits = digits.slice(2)
  if (!international) {
    if (/^[6789]\d{8}$/.test(digits)) digits = `34${digits}`
    else if (!/^34[6789]\d{8}$/.test(digits)) return null
  }
  if (digits.startsWith('34')) return /^34[6789]\d{8}$/.test(digits) ? digits : null
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null
}

export function contactWhatsappLink(phone: string | null | undefined): string | null {
  const number = contactWhatsappNumber(phone)
  if (!number) return null
  const url = new URL(`https://wa.me/${number}`)
  url.searchParams.set('text', 'Hola, contactamos contigo en relación con el servicio.')
  return url.toString()
}

export function visitMapsLink(
  address: string | null | undefined,
  coordinates?: { latitude: number | null | undefined; longitude: number | null | undefined },
): string | null {
  const { latitude, longitude } = coordinates ?? {}
  const validCoordinates =
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  const destination = validCoordinates ? `${latitude},${longitude}` : address?.trim()
  if (!destination) return null
  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  url.searchParams.set('destination', destination)
  return url.toString()
}
