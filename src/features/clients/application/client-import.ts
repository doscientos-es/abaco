import type { ImportSchema } from '@/shared/domain/table-import'
import { formLimits } from '@/shared/domain/form-limits'
import type { Client } from '@/shared/domain/types'

import type { ClientInput } from './client-actions'

export function clientKeys(clients: Client[]): Set<string> {
  return new Set(clients.flatMap((client) => clientImportSchema.duplicateKeys(client)))
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const clientImportSchema: ImportSchema<ClientInput> = {
  singular: 'cliente',
  plural: 'clientes',
  columns: [
    { label: 'Nombre', aliases: ['Cliente', 'Nombre y apellidos'], required: true, hint: 'Nombre del cliente.', example: 'Marta Soler' },
    { label: 'NIF', aliases: ['CIF', 'NIF / CIF', 'DNI'], hint: 'Documento fiscal, sin espacios.', example: '12345678Z' },
    { label: 'Email', aliases: ['Correo'], hint: 'Un único correo válido.', example: 'marta@ejemplo.es' },
    { label: 'Teléfono', aliases: ['Telefono', 'Móvil', 'Movil'], hint: 'Con o sin prefijo.', example: '600123456' },
    { label: 'Dirección', aliases: ['Direccion', 'Obra'], hint: 'Dirección o ubicación de la obra.', example: 'Calle Mayor 1, Madrid' },
    { label: 'Notas', aliases: ['Observaciones'], hint: 'Texto libre.', example: 'Prefiere WhatsApp' },
  ],
  parse(row) {
    const name = row['Nombre'] ?? ''
    if (!name.trim()) return { ok: false, error: 'Falta el nombre.' }
    if (name.length > formLimits.clientName) return { ok: false, error: `El nombre supera ${formLimits.clientName} caracteres.` }
    const email = row['Email'] ?? ''
    if (email && !emailPattern.test(email)) return { ok: false, error: `Email no válido: ${email}` }
    if (email.length > formLimits.email) return { ok: false, error: `El email supera ${formLimits.email} caracteres.` }
    const taxId = (row['NIF'] ?? '').replace(/\s/g, '').toUpperCase()
    if (taxId.length > formLimits.taxId) return { ok: false, error: `El NIF supera ${formLimits.taxId} caracteres.` }
    const phone = row['Teléfono'] ?? ''
    if (phone.length > formLimits.phone) return { ok: false, error: `El teléfono supera ${formLimits.phone} caracteres.` }
    const address = row['Dirección'] ?? ''
    if (address.length > formLimits.address) return { ok: false, error: `La dirección supera ${formLimits.address} caracteres.` }
    const notes = row['Notas'] ?? ''
    if (notes.length > formLimits.notes) return { ok: false, error: `Las notas superan ${formLimits.notes} caracteres.` }
    return {
      ok: true,
      value: {
        name: name.trim(),
        taxId,
        email,
        phone,
        address,
        notes,
      },
    }
  },
  duplicateKeys: (client) =>
    [client.taxId && `nif:${client.taxId}`, client.email && `email:${client.email.toLowerCase()}`].filter(
      (key): key is string => Boolean(key),
    ),
}
