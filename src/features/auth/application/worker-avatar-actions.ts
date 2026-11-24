import { useQuery } from '@tanstack/react-query'

import { loadWorkerAvatar } from '../infrastructure/worker-avatar-storage'
import { useSession } from './auth-actions'

export { saveWorkerAvatar } from '../infrastructure/worker-avatar-storage'

export function workerAvatarKey(tenantId: string, userId: string) {
  return ['worker-avatar', tenantId, userId] as const
}

export function useWorkerAvatar(userId?: string | null) {
  const session = useSession()
  const tenantId = session?.tenantId
  const target = userId ?? session?.userId
  return useQuery({
    queryKey: [...workerAvatarKey(tenantId ?? '', target ?? ''), session?.userId ?? ''],
    queryFn: () => {
      if (!tenantId || !target) throw new Error('No hay empresa o trabajador seleccionado.')
      return loadWorkerAvatar(tenantId, target)
    },
    enabled: Boolean(tenantId && target && session?.userId),
    staleTime: 15 * 60_000,
    refetchInterval: 20 * 60_000,
  })
}
