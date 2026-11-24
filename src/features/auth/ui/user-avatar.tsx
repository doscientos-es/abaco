import { Avatar, AvatarFallback, AvatarImage } from '@doscientos/ui'

export function UserAvatar({
  name,
  avatarUrl,
}: {
  name: string
  avatarUrl?: string | null | undefined
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
  return (
    <Avatar>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" /> : null}
      <AvatarFallback>{initials || '?'}</AvatarFallback>
    </Avatar>
  )
}
