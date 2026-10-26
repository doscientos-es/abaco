import type { Client } from '@/shared/domain/types'

import type { ClientInput } from './client-actions'

function compact(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim()
}

function alphanumeric(value: string): string {
  return compact(value).replace(/[^a-z0-9]/g, '')
}

function digits(value: string): string {
  return value.replace(/\D/g, '')
}

export function findPotentialClientDuplicates(
  input: ClientInput,
  clients: Client[],
  editingId?: string,
): Array<{ client: Client; reasons: string[] }> {
  const taxId = alphanumeric(input.taxId)
  const email = compact(input.email)
  const phone = digits(input.phone)
  const name = compact(input.name).replace(/\s+/g, ' ')

  return clients
    .filter((client) => client.id !== editingId)
    .map((client) => {
      const reasons: string[] = []
      if (taxId.length >= 8 && alphanumeric(client.taxId) === taxId) reasons.push('mismo NIF/CIF')
      if (email.includes('@') && compact(client.email) === email) reasons.push('mismo email')
      if (phone.length >= 9 && digits(client.phone) === phone) reasons.push('mismo teléfono')
      if (name.length >= 4 && compact(client.name).replace(/\s+/g, ' ') === name)
        reasons.push('mismo nombre')
      return { client, reasons }
    })
    .filter((match) => match.reasons.length > 0)
    .sort((a, b) => b.reasons.length - a.reasons.length)
    .slice(0, 5)
}
