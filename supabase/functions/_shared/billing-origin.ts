export const menosliosOrigin = 'https://app.menoslios.com'

export function billingOrigin(requestOrigin: string | null, legacyAppUrl: string | undefined) {
  let legacyOrigin: string | null = null
  try {
    if (legacyAppUrl) {
      const url = new URL(legacyAppUrl)
      if (url.protocol === 'https:') legacyOrigin = url.origin
    }
  } catch {
    // A malformed configured origin must not be reflected in CORS or provider returns.
  }
  if (requestOrigin === menosliosOrigin || requestOrigin === legacyOrigin) return requestOrigin
  return null
}
