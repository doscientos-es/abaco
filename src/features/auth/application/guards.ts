import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'

import { can, type Permission } from '../domain/permissions'
import { sessionQuery } from './auth-actions'

/** Route `beforeLoad` that sends people without the permission back to the dashboard. */
export function requirePermission(permission: Permission) {
  return async ({ context }: { context: { queryClient: QueryClient } }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery)
    if (!can(session?.role, permission)) throw redirect({ to: '/', replace: true })
  }
}
