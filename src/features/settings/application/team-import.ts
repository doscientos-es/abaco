import type { Role } from '@/features/auth'
import { MAX_IMPORT_ROWS, normalizeHeader, type ImportSchema } from '@/shared/domain/table-import'

import type { TeamResult } from './team-actions'

export type TeamInvitation = { email: string; fullName: string; role: Role }

const fields = ['Correo', 'Nombre', 'Rol'] as const
type InvitationField = (typeof fields)[number]
export type TeamImportMapping = Partial<Record<InvitationField, number>>
export const MAX_TEAM_IMPORT_INVITATIONS = 50

export const teamImportSchema: ImportSchema<TeamInvitation> = {
  singular: 'persona',
  plural: 'personas del equipo',
  columns: [
    {
      label: 'Correo',
      aliases: ['Email', 'E-mail', 'Correo electrónico'],
      required: true,
      hint: 'Correo válido.',
      example: 'ana@example.test',
    },
    {
      label: 'Nombre',
      aliases: ['Nombre completo', 'Nombre y apellidos'],
      hint: 'Nombre opcional, entre 2 y 120 caracteres.',
      example: 'Ana Ejemplo',
    },
    {
      label: 'Rol',
      aliases: ['Perfil', 'Permisos'],
      hint: 'Usuario o Administrador. Vacío significa Usuario.',
      example: 'Usuario',
    },
  ],
  parse(row) {
    const email = (row['Correo'] ?? '').trim().toLowerCase()
    const fullName = (row['Nombre'] ?? '').trim()
    const role = (row['Rol'] ?? '').trim().toLowerCase()
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return { ok: false, error: 'Correo no válido.' }
    if (fullName && (fullName.length < 2 || fullName.length > 120))
      return { ok: false, error: 'El nombre debe tener entre 2 y 120 caracteres.' }
    if (!['', 'usuario', 'user', 'administrador', 'admin'].includes(role))
      return { ok: false, error: 'El rol debe ser Usuario o Administrador.' }
    return {
      ok: true,
      value: {
        email,
        fullName,
        role: role === 'admin' || role === 'administrador' ? 'admin' : 'user',
      },
    }
  },
  duplicateKeys: ({ email }) => [email],
}

const privateHeaders = new Set([
  'dni',
  'nie',
  'nif',
  'cif',
  'dniynif',
  'dninie',
  'nifcif',
  'documentodeidentidad',
  'documento',
  'dniotienif',
  'numerodedocumento',
  'identificacion',
  'pasaporte',
  'telefono',
  'movil',
  'phone',
])

export function teamImportHeaders(table: string[][]) {
  const headerRow = table.findIndex((row) => row.some((cell) => cell.trim()))
  const headers = (table[headerRow] ?? []).slice(0, 200).flatMap((label, index) => {
    const clean = label.trim()
    return clean && !privateHeaders.has(normalizeHeader(clean)) ? [{ index, label: clean }] : []
  })
  return { headerRow, headers }
}

export function suggestTeamImportMapping(table: string[][]): TeamImportMapping {
  const { headers } = teamImportHeaders(table)
  const mapping: TeamImportMapping = {}
  for (const field of fields) {
    const column = teamImportSchema.columns.find((column) => column.label === field)
    const names = [field, ...(column?.aliases ?? [])].map(normalizeHeader)
    const matches = headers.filter((header) => names.includes(normalizeHeader(header.label)))
    if (matches.length === 1 && matches[0]) mapping[field] = matches[0].index
  }
  return mapping
}

export type TeamImportRow =
  | { line: number; status: 'ready'; invitation: TeamInvitation }
  | { line: number; status: 'duplicate' | 'invalid'; message: string }
export type ReadyTeamImportRow = Extract<TeamImportRow, { status: 'ready' }>
export type TeamImportPlan = { fatal: string } | { rows: TeamImportRow[] }

export function previewTeamImport(
  table: string[][],
  mapping: TeamImportMapping,
  existingEmails: readonly string[],
): TeamImportPlan {
  const { headerRow, headers } = teamImportHeaders(table)
  if (headerRow === -1) return { fatal: 'La hoja está vacía.' }
  const available = new Set(headers.map(({ index }) => index))
  const mapped = fields.flatMap((field) => {
    const index = mapping[field]
    return index === undefined ? [] : [index]
  })
  if (mapping.Correo === undefined) return { fatal: 'Elige la columna del correo.' }
  if (mapped.some((index) => !available.has(index)))
    return { fatal: 'Una columna elegida no es válida.' }
  if (new Set(mapped).size !== mapped.length)
    return { fatal: 'Usa una columna distinta para cada campo.' }
  const data = table
    .slice(headerRow + 1)
    .flatMap((cells, index) =>
      cells.some((cell) => cell.trim()) ? [{ cells, line: headerRow + index + 2 }] : [],
    )
  if (data.length === 0) return { fatal: 'La hoja solo tiene cabeceras, sin datos.' }
  if (data.length > MAX_IMPORT_ROWS)
    return { fatal: `La hoja tiene más de ${MAX_IMPORT_ROWS} filas. Divídela en varios archivos.` }

  const members = new Set(existingEmails.map((email) => email.trim().toLowerCase()))
  const countByEmail = new Map<string, number>()
  const emailIndex = mapping.Correo
  for (const { cells } of data) {
    const email = cells[emailIndex]?.trim().toLowerCase() ?? ''
    if (email) countByEmail.set(email, (countByEmail.get(email) ?? 0) + 1)
  }
  const rows: TeamImportRow[] = data.map(({ cells, line }) => {
    const item: Record<string, string> = {}
    for (const field of fields) {
      const index = mapping[field]
      item[field] = index === undefined ? '' : (cells[index] ?? '')
    }
    // Reserve the email even when another cell of its first row was invalid: never
    // send an ambiguously repeated address from the file.
    const email = item['Correo']?.trim().toLowerCase() ?? ''
    if (email && members.has(email))
      return { line, status: 'duplicate', message: 'La persona ya pertenece al equipo.' }
    if ((countByEmail.get(email) ?? 0) > 1)
      return { line, status: 'duplicate', message: 'El correo se repite en la hoja.' }
    const result = teamImportSchema.parse(item)
    return result.ok
      ? { line, status: 'ready', invitation: result.value }
      : { line, status: 'invalid', message: result.error }
  })
  return { rows }
}

export type TeamImportOutcome = {
  line: number
  status: 'invited' | 'added' | 'unconfirmed' | 'skipped' | 'not-attempted'
  message?: string
}

export async function sendTeamInvitations(
  rows: ReadyTeamImportRow[],
  existingEmails: readonly string[],
  send: (invitation: TeamInvitation) => Promise<TeamResult>,
): Promise<TeamImportOutcome[]> {
  const membership = new Set(existingEmails.map((email) => email.trim().toLowerCase()))
  const results: TeamImportOutcome[] = []
  let stopped = false
  for (const { line, invitation } of rows) {
    if (stopped) {
      results.push({ line, status: 'not-attempted' })
      continue
    }
    if (membership.has(invitation.email)) {
      results.push({ line, status: 'skipped', message: 'La persona ya pertenece al equipo.' })
      continue
    }
    try {
      const response = await send(invitation)
      if (response.ok && response.status) {
        results.push({ line, status: response.status })
        membership.add(invitation.email)
        continue
      }
      results.push({
        line,
        status: 'unconfirmed',
        message: response.ok ? 'El servidor no confirmó el resultado.' : response.message,
      })
    } catch {
      results.push({ line, status: 'unconfirmed', message: 'Se perdió la respuesta del servidor.' })
    }
    // A timeout or a failure can occur after sending the email but before adding
    // membership. Never retry automatically or pretend that nothing was sent.
    stopped = true
  }
  return results
}
