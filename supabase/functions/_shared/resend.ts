/** Envío de email con Resend. Solo se usa desde Edge Functions: la clave nunca llega al navegador. */
export async function sendEmail(input: { to: string; subject: string; html: string; text: string; replyTo?: string }) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('RESEND_FROM')
  if (!apiKey || !from) throw new Error('Faltan RESEND_API_KEY o RESEND_FROM en los secretos de la función.')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    }),
  })
  if (!response.ok) {
    // No se registra el cuerpo de la petición: contiene el enlace de acceso.
    throw new Error(`Resend respondió ${response.status}: ${await response.text()}`)
  }
}
