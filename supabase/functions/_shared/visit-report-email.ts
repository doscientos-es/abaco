/** A delivery stores encrypted bearer material; only Edge Functions know this key. */
function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fromBase64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) throw new Error('Clave de entrega inválida')
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function keyFromSecret(secret: string) {
  const raw = fromBase64url(secret)
  if (raw.length !== 32) throw new Error('REPORT_DELIVERY_KEY debe contener 32 bytes')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptReportToken(token: string, deliveryId: string, secret: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('Token de informe inválido')
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: new TextEncoder().encode(deliveryId) },
    await keyFromSecret(secret),
    new TextEncoder().encode(token),
  )
  return { nonce: base64url(nonce), ciphertext: base64url(new Uint8Array(ciphertext)) }
}

export async function decryptReportToken(
  ciphertext: string,
  nonce: string,
  deliveryId: string,
  secret: string,
) {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64url(nonce),
      additionalData: new TextEncoder().encode(deliveryId),
    },
    await keyFromSecret(secret),
    fromBase64url(ciphertext),
  )
  const token = new TextDecoder().decode(plaintext)
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('Token almacenado inválido')
  return token
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type ReportEmailContent = {
  id: string
  recipient_name: string
  recipient_email: string
  company_name: string
  sender_name: string
  sender_address: string
  reply_to: string | null
  app_url: string
}

export function visitReportEmail(input: ReportEmailContent, token: string) {
  const link = `${input.app_url}/i/${token}`
  const subject = `Parte de visita · ${input.company_name}`
  const text = [
    `Hola ${input.recipient_name},`,
    '',
    `${input.company_name} te comparte el informe de la visita cerrada.`,
    `Puedes consultar y descargar el parte aquí: ${link}`,
    '',
    'El enlace caduca y puede ser revocado por la empresa.',
    input.sender_name,
  ].join('\n')
  const html = `<!doctype html><html lang="es" dir="ltr"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head><body><div lang="es" dir="ltr" style="font-family:Arial,sans-serif;color:#171717;line-height:1.5"><h1 style="color:#2a4227;font-size:22px">Parte de visita</h1><p>Hola ${escapeHtml(input.recipient_name)},</p><p>${escapeHtml(input.company_name)} te comparte el informe de la visita cerrada.</p><p><a href="${escapeHtml(link)}" style="color:#2a4227;font-weight:600">Consultar y descargar el parte</a></p><p>El enlace caduca y puede ser revocado por la empresa.</p><p>${escapeHtml(input.sender_name)}</p></div></body></html>`
  return {
    to: input.recipient_email,
    subject,
    text,
    html,
    fromName: input.sender_name,
    fromAddress: input.sender_address,
    replyTo: input.reply_to ?? undefined,
    idempotencyKey: `visit-report/${input.id}`,
    tags: [{ name: 'category', value: 'visit_report' }],
  }
}
