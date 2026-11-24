import { Avatar, AvatarFallback, AvatarImage } from '@doscientos/ui'

import { useSession } from '../application/auth-actions'
import { useWorkerAvatar } from '../application/worker-avatar-actions'

export function UserAvatar({
  name,
  avatarUrl,
  userId,
  className,
}: {
  name: string
  avatarUrl?: string | null | undefined
  userId?: string | null | undefined
  className?: string | undefined
}) {
  const session = useSession()
  const photo = useWorkerAvatar(userId)
  const image =
    photo.data ?? avatarUrl ?? (session && userId === session.userId ? session.avatarUrl : null)
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
  return (
    <Avatar className={className}>
      {image ? <AvatarImage src={image} alt="" referrerPolicy="no-referrer" /> : null}
      <AvatarFallback>{initials || '?'}</AvatarFallback>
    </Avatar>
  )
}
