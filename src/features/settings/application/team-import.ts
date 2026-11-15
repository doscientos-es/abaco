import type { Role } from '@/features/auth'
import type { ImportSchema } from '@/shared/domain/table-import'

import { validWorkerDni, validWorkerPhone } from '../domain/worker-personal-data'
import type { TeamResult } from './team-actions'

export type TeamInvitation = {
  email: string
  fullName: string
  role: Role
  dni: string
  phone: string
}

export const teamImportSchema: ImportSchema<TeamInvitation> = {
  singular: 'persona',
  plural: 'personas del equipo',
  columns: [
    {
      label: 'Correo',
      aliases: ['Email'],
      required: true,
      hint: 'Correo válido.',
      example: 'ana@ejemplo.es',
    },
    { label: 'Nombre', hint: 'Nombre opcional, entre 2 y 120 caracteres.', example: 'Ana García' },
    {
      label: 'DNI',
      aliases: ['NIE', 'Documento de identidad'],
      required: true,
      hint: 'Documento de identidad obligatorio.',
      example: '12345678Z',
    },
    {
      label: 'Teléfono',
      aliases: ['Telefono', 'Móvil', 'Phone'],
      hint: 'Teléfono opcional.',
      example: '600123456',
    },
    {
      label: 'Rol',
      hint: 'Usuario o Administrador. Vacío significa Usuario.',
      example: 'Usuario',
    },
  ],
  parse(row) {
    const email = (row['Correo'] ?? '').trim().toLowerCase()
    const fullName = (row['Nombre'] ?? '').trim()
    const dni = (row['DNI'] ?? '').trim()
    const phone = (row['Teléfono'] ?? '').trim()
    const role = (row['Rol'] ?? '').trim().toLowerCase()
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return { ok: false, error: 'Correo no válido.' }
    if (fullName && (fullName.length < 2 || fullName.length > 120))
      return { ok: false, error: 'El nombre debe tener entre 2 y 120 caracteres.' }
    if (!validWorkerDni(dni))
      return { ok: false, error: 'El DNI es obligatorio (máximo 40 caracteres).' }
    if (!validWorkerPhone(phone)) return { ok: false, error: 'El teléfono supera 40 caracteres.' }
    if (!['', 'usuario', 'user', 'administrador', 'admin'].includes(role))
      return { ok: false, error: 'El rol debe ser Usuario o Administrador.' }
    return {
      ok: true,
      value: {
        email,
        fullName,
        dni,
        phone,
        role: role === 'admin' || role === 'administrador' ? 'admin' : 'user',
      },
    }
  },
  duplicateKeys: ({ email }) => [email.toLowerCase()],
}

export async function sendTeamInvitations(
  invitations: TeamInvitation[],
  send: (invitation: TeamInvitation) => Promise<TeamResult>,
): Promise<{ completed: number; failed?: { email: string; message: string }; remaining: number }> {
  for (const [index, invitation] of invitations.entries()) {
    let result: TeamResult
    try {
      result = await send(invitation)
    } catch {
      result = {
        ok: false,
        message:
          'No se pudo confirmar el resultado. Revisa el equipo antes de volver a intentarlo.',
      }
    }
    if (!result.ok)
      return {
        completed: index,
        failed: { email: invitation.email, message: result.message },
        remaining: invitations.length - index - 1,
      }
  }
  return { completed: invitations.length, remaining: 0 }
}
