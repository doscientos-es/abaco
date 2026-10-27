import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Comprueba la cabecera `x-cron-secret` en tiempo constante. Se comparan los hashes SHA-256
 * para que la longitud del secreto tampoco se filtre por el tiempo de respuesta.
 */
export function isCronAuthorized(request: Request, secret: string): boolean {
  const received = request.headers.get('x-cron-secret')
  if (!secret || received === null) return false
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(received), digest(secret))
}
