import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserAvatar } from './user-avatar'

const mocks = vi.hoisted(() => ({ photo: null as string | null, userId: '' }))
vi.mock('@doscientos/ui', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  AvatarImage: ({ src }: { src: string }) => <img src={src} alt="" />,
}))
vi.mock('../application/auth-actions', () => ({
  useSession: () => ({ userId: 'me', avatarUrl: 'https://google.example/photo' }),
}))
vi.mock('../application/worker-avatar-actions', () => ({
  useWorkerAvatar: (userId: string) => {
    mocks.userId = userId
    return { data: mocks.photo }
  },
}))

describe('worker avatar', () => {
  beforeEach(() => {
    mocks.photo = null
    mocks.userId = ''
  })

  it('prefers the uploaded photo to Google and initials', () => {
    mocks.photo = 'https://storage.example/signed'
    const html = renderToStaticMarkup(<UserAvatar name="Ana García" userId="me" />)
    expect(html).toContain('https://storage.example/signed')
    expect(html).not.toContain('https://google.example/photo')
  })

  it('uses Google only for the current user and initials for others', () => {
    expect(renderToStaticMarkup(<UserAvatar name="Ana García" userId="me" />)).toContain(
      'https://google.example/photo',
    )
    const html = renderToStaticMarkup(<UserAvatar name="Pol Puig" userId="other" />)
    expect(html).toContain('PP')
    expect(html).not.toContain('https://google.example/photo')
    expect(mocks.userId).toBe('other')
  })
})
