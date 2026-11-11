import { describe, expect, it } from 'vitest'

import { inviteCorsHeaders } from './invite-cors.ts'

const request = (origin?: string, method = 'OPTIONS') =>
  new Request('https://example.test/invite', {
    method,
    headers: origin ? { Origin: origin } : {},
  })

describe('inviteCorsHeaders', () => {
  it('allows the application origin and explicitly configured local origins', () => {
    const appUrl = 'https://app.example.test/'
    const additionalOrigins = 'http://localhost:5173, https://preview.example.test'
    for (const origin of [
      'https://app.example.test',
      'http://localhost:5173',
      'https://preview.example.test',
    ]) {
      for (const method of ['OPTIONS', 'POST']) {
        expect(inviteCorsHeaders(request(origin, method), appUrl, additionalOrigins)).toMatchObject(
          {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
            Vary: 'Origin',
          },
        )
      }
    }
  })

  it('does not allow unconfigured or similar origins, wildcard, or null', () => {
    for (const origin of [
      'http://localhost:5173',
      'https://app.example.test.evil.test',
      'null',
      'https://evil.test',
    ]) {
      expect(
        inviteCorsHeaders(request(origin), 'https://app.example.test', '*'),
      ).not.toHaveProperty('Access-Control-Allow-Origin')
    }
    expect(inviteCorsHeaders(request(), undefined, undefined)).not.toHaveProperty(
      'Access-Control-Allow-Origin',
    )
  })

  it('ignores malformed URLs and URLs containing credentials', () => {
    expect(
      inviteCorsHeaders(request('https://evil.test'), 'not-a-url', 'https://user@evil.test'),
    ).not.toHaveProperty('Access-Control-Allow-Origin')
  })
})
