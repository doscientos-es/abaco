type ReadEnvironment = (name: string) => string | undefined

/** Both values must belong to the same Google OAuth client. */
export function googleOAuthCredentials(read: ReadEnvironment) {
  const clientId = read('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = read('GOOGLE_OAUTH_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('Google OAuth credentials not configured')
  return { clientId, clientSecret }
}
