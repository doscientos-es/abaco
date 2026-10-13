/**
 * Roles and what each one may do. This only drives the UI (menus, buttons, route guards).
 * The real authority is Postgres RLS, which must repeat these rules for every table.
 */
export type Role = 'owner' | 'admin' | 'editor' | 'viewer'

export const roles: readonly Role[] = ['owner', 'admin', 'editor', 'viewer']

export const roleLabels: Record<Role, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Solo lectura',
}

export const roleDescriptions: Record<Role, string> = {
  owner: 'Control total, incluido el equipo y los ajustes.',
  admin: 'Gestiona el equipo, los ajustes y todo el negocio.',
  editor: 'Crea y edita presupuestos, clientes y catálogo. No ve contabilidad ni ajustes.',
  viewer: 'Solo puede consultar presupuestos, clientes y catálogo.',
}

export type Permission =
  | 'estimates:read'
  | 'estimates:write'
  | 'clients:read'
  | 'clients:write'
  | 'catalog:read'
  | 'catalog:write'
  | 'invoices:read'
  | 'invoices:write'
  | 'ledger:read'
  | 'ledger:write'
  | 'settings:write'
  | 'team:manage'

const everything: readonly Permission[] = [
  'estimates:read',
  'estimates:write',
  'clients:read',
  'clients:write',
  'catalog:read',
  'catalog:write',
  'invoices:read',
  'invoices:write',
  'ledger:read',
  'ledger:write',
  'settings:write',
  'team:manage',
]

const matrix: Record<Role, readonly Permission[]> = {
  owner: everything,
  admin: everything,
  editor: [
    'estimates:read',
    'estimates:write',
    'clients:read',
    'clients:write',
    'catalog:read',
    'catalog:write',
    'invoices:read',
  ],
  viewer: ['estimates:read', 'clients:read', 'catalog:read'],
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return role ? matrix[role].includes(permission) : false
}

/** Roles that `inviter` may hand out. Only the owner can appoint admins; nobody invites owners. */
export function assignableRoles(inviter: Role | null | undefined): Role[] {
  if (inviter === 'owner') return ['admin', 'editor', 'viewer']
  if (inviter === 'admin') return ['editor', 'viewer']
  return []
}

export function isRole(value: string): value is Role {
  return (roles as readonly string[]).includes(value)
}
