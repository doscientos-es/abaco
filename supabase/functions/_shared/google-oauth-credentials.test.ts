import { describe, expect, it } from 'vitest'

import { googleOAuthCredentials } from './google-oauth-credentials.ts'

describe('shared Google OAuth credentials', () => {
  it('reads the shared client pair for all Google integrations', () => {
    const env: Record<string, string> = {
      GOOGLE_OAUTH_CLIENT_ID: 'test-client',
      GOOGLE_OAUTH_CLIENT_SECRET: 'test-secret',
    }
    expect(googleOAuthCredentials((name) => env[name])).toEqual({
      clientId: 'test-client',
      clientSecret: 'test-secret',
    })
  })

  it.each([
    {},
    { GOOGLE_OAUTH_CLIENT_ID: 'test-client' },
    { GOOGLE_OAUTH_CLIENT_SECRET: 'test-secret' },
  ])('rejects an incomplete client pair', (env) => {
    expect(() => googleOAuthCredentials((name) => (env as Record<string, string>)[name])).toThrow()
  })
})
