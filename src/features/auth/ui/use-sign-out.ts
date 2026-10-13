import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { signOut } from '../application/auth-actions'

/** Signs out, wipes every cached query (another user must never see this data) and goes to /entrar. */
export function useSignOut() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return async () => {
    await signOut()
    queryClient.clear()
    await navigate({ to: '/entrar' })
  }
}
