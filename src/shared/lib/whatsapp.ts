/**
 * Normalises a phone number to the digits wa.me expects (international format, no "+").
 * Numbers without a country prefix get the default one (Spain, 34).
 */
export function whatsappNumber(phone: string, defaultCountry = '34'): string {
  const trimmed = phone.trim()
  let digits = trimmed.replace(/\D/g, '')
  if (trimmed.startsWith('00')) digits = digits.slice(2)
  else if (!trimmed.startsWith('+') && digits.length <= 10) digits = defaultCountry + digits.replace(/^0+/, '')
  return digits
}

/** Builds a wa.me link with the message prefilled. Without a phone it opens the contact picker. */
export function whatsappLink(phone: string, message: string): string {
  const number = whatsappNumber(phone)
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}

export function openWhatsapp(phone: string, message: string): void {
  window.open(whatsappLink(phone, message), '_blank', 'noopener,noreferrer')
}
