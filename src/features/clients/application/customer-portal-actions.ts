export {
  createClientPortalGrant,
  listClientPortalOptions,
  revokeClientPortalGrant,
  type PortalActiveLink,
  type PortalOfficeOptions,
} from '../infrastructure/customer-portal-repository'

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function createPortalSecret() {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)))
  const hash = hex(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))),
  )
  return { token, hash }
}
