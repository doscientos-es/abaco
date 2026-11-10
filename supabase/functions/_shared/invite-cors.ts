function originOf(value: string): string | null {
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    return url.origin
  } catch {
    return null
  }
}

export function inviteCorsHeaders(
  request: Request,
  appUrl: string | undefined,
  additionalOrigins: string | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
  const origin = request.headers.get('Origin')
  const allowedOrigins = [appUrl ?? '', ...(additionalOrigins ?? '').split(',')].map(originOf)
  if (origin && allowedOrigins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}