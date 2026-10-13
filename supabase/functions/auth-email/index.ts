/**
 * Supabase Auth "Send Email Hook": Auth llama aquí en vez de enviar el correo él mismo,
 * y lo enviamos con Resend. Cubre recuperar contraseña, invitaciones, confirmación, etc.
 *
 * El enlace apunta a la app (/confirmar), no al endpoint /auth/v1/verify de Supabase. Así el
 * token solo se consume cuando la persona hace clic y la app lo valida con verifyOtp; los
 * antivirus que "visitan" los enlaces de los correos no lo gastan.
 *
 * Secretos: SEND_EMAIL_HOOK_SECRET (el que da Supabase, "v1,whsec_..."), RESEND_API_KEY,
 * RESEND_FROM y APP_URL (p. ej. https://presupuestos.tudominio.es, sin barra final).
 */
import { Webhook } from 'npm:standardwebhooks@1.0.0'

import { sendEmail } from '../_shared/resend.ts'
import { renderEmail, type EmailKind } from './templates.ts'

type HookPayload = {
  user: { email: string; new_email?: string }
  email_data: {
    token: string
    token_hash: string
    token_new?: string
    token_hash_new?: string
    email_action_type: EmailKind
  }
}

function hookError(status: number, message: string) {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function confirmLink(appUrl: string, tokenHash: string, kind: EmailKind) {
  const url = new URL('/confirmar', appUrl)
  url.searchParams.set('token_hash', tokenHash)
  url.searchParams.set('type', kind)
  return url.toString()
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return hookError(405, 'Método no permitido')

  const secret = Deno.env.get('SEND_EMAIL_HOOK_SECRET')?.replace('v1,whsec_', '')
  const appUrl = Deno.env.get('APP_URL')
  if (!secret || !appUrl) return hookError(500, 'Función sin configurar')

  const body = await request.text()
  let payload: HookPayload
  try {
    payload = new Webhook(secret).verify(body, Object.fromEntries(request.headers)) as HookPayload
  } catch {
    return hookError(401, 'Firma no válida')
  }

  const { user, email_data: data } = payload
  const kind = data.email_action_type
  const messages = [{ to: user.email, tokenHash: data.token_hash, code: data.token }]
  if (kind === 'email_change' && user.new_email && data.token_hash_new) {
    messages.push({ to: user.new_email, tokenHash: data.token_hash_new, code: data.token_new ?? '' })
  }

  try {
    for (const message of messages) {
      const { subject, html, text } = renderEmail(kind, confirmLink(appUrl, message.tokenHash, kind), message.code)
      await sendEmail({ to: message.to, subject, html, text })
    }
  } catch (error) {
    // eslint-disable-next-line no-console -- Edge Function: logs go to the Supabase dashboard.
    console.error('auth-email: no se pudo enviar', error instanceof Error ? error.message : 'error')
    return hookError(500, 'No se pudo enviar el correo')
  }

  return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
