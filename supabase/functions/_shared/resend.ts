/** Envío de email con Resend. Solo se usa desde Edge Functions: la clave nunca llega al navegador. */
export async function sendEmail(input: {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
  /** Display name shown to the recipient; the address comes from server configuration. */
  fromName?: string
  /** A previously captured server-side sender keeps retries byte-for-byte stable. */
  fromAddress?: string
  idempotencyKey?: string
  tags?: { name: string; value: string }[]
}) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const configuredFrom = Deno.env.get('RESEND_FROM')
  if (!apiKey || !configuredFrom)
    throw new Error('Faltan RESEND_API_KEY o RESEND_FROM en los secretos de la función.')
  const address = input.fromAddress ?? /<([^>]+)>/.exec(configuredFrom)?.[1] ?? configuredFrom
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address))
    throw new Error('Dirección de envío inválida')
  if (
    input.idempotencyKey &&
    (input.idempotencyKey.length > 256 || /[\r\n]/.test(input.idempotencyKey))
  )
    throw new Error('Clave de idempotencia inválida')
  const name = input.fromName?.replace(/["<>\r\n]/g, '').trim()
  const from = name ? `${name} <${address}>` : input.fromAddress ? address : configuredFrom

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      ...(input.tags ? { tags: input.tags } : {}),
    }),
  })
  if (!response.ok) {
    // Provider responses can include addresses or content; keep logs to a status code.
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
    const code = body?.name === 'concurrent_idempotent_requests' ? body.name : undefined
    throw new EmailSendError(response.status, code)
  }
  const result = (await response.json().catch(() => null)) as { id?: unknown } | null
  if (typeof result?.id === 'string') return result.id
  if (input.idempotencyKey) throw new EmailSendError(502)
  return ''
}

export class EmailSendError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super(`Resend respondió ${status}`)
  }

  get retryable() {
    return (
      this.status === 429 ||
      this.status >= 500 ||
      (this.status === 409 && this.code === 'concurrent_idempotent_requests')
    )
  }
}
