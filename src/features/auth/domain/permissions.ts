/**
 * Roles and what each one may do. This only drives the UI (menus, buttons, route guards).
 * The real authority is Postgres RLS, which must repeat these rules for every table.
 */
export type Role = 'admin' | 'user'

export const roles: readonly Role[] = ['admin', 'user']

export const roleLabels: Record<Role, string> = {
  admin: 'Administrador',
  user: 'Usuario',
}

export const roleDescriptions: Record<Role, string> = {
  admin: 'Gestiona el equipo, los ajustes y todo el negocio.',
  user: 'Consulta sus visitas asignadas y puede solicitar vacaciones.',
}

export type Permission =
  | 'estimates:read'
  | 'estimates:write'
  | 'clients:read'
  | 'clients:write'
  | 'catalog:read'
  | 'catalog:write'
  | 'work:read'
  | 'work:write'
  | 'work:costs'
  | 'contracts:read'
  | 'contracts:write'
  | 'invoices:read'
  | 'invoices:write'
  | 'ledger:read'
  | 'ledger:write'
  | 'settings:personal'
  | 'settings:write'
  | 'team:manage'
  | 'visits:read'
  | 'visits:write'
  | 'visits:assigned'
  | 'vacations:request'
  | 'vacations:manage'

const everything: readonly Permission[] = [
  'estimates:read',
  'estimates:write',
  'clients:read',
  'clients:write',
  'catalog:read',
  'catalog:write',
  'work:read',
  'work:write',
  'work:costs',
  'contracts:read',
  'contracts:write',
  'invoices:read',
  'invoices:write',
  'ledger:read',
  'ledger:write',
  'settings:personal',
  'settings:write',
  'team:manage',
  'visits:read',
  'visits:write',
  'vacations:request',
  'vacations:manage',
]

const matrix: Record<Role, readonly Permission[]> = {
  admin: everything,
  user: ['visits:assigned', 'vacations:request', 'settings:personal'],
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return role ? matrix[role].includes(permission) : false
}

/** Roles that an admin may hand out. */
export function assignableRoles(inviter: Role | null | undefined): Role[] {
  return inviter === 'admin' ? ['admin', 'user'] : []
}

export function isRole(value: string): value is Role {
  return (roles as readonly string[]).includes(value)
}

/** Legacy technician memberships retain their database permissions but use the worker UI. */
export function roleFromMembership(value: string): Role | null {
  return value === 'technician' ? 'user' : isRole(value) ? value : null
}
