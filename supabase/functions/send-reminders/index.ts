/**
 * Recordatorios automáticos a clientes. Se lanza una vez al día (cron) con la cabecera `x-cron-secret`
 * igual al secreto CRON_SECRET. Despliegue con --no-verify-jwt.
 *
 * Solo actúa en empresas con `tenants.auto_reminders = true`:
 *  - Facturas vencidas y sin cobrar: un aviso cada 7 días, hasta 3.
 *  - Presupuestos enviados que caducan en 3 días o menos: un único aviso.
 *  - Presupuestos enviados hace 4+ días sin respuesta: un único seguimiento.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

import { sendEmail } from '../_shared/resend.ts'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const colorPattern = /^#[0-9a-fA-F]{6}$/
const MAX_INVOICE_REMINDERS = 3
const DAY = 24 * 60 * 60 * 1000

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const euros = (cents: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100)
const isoDay = (date: Date) => date.toISOString().slice(0, 10)

function toHtml(text: string, color: string) {
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;border-top:4px solid ${color};padding-top:16px">${text
    .split('\n')
    .map((line) => (line ? `<p style="margin:0 0 8px">${escapeHtml(line)}</p>` : '<br>'))
    .join('')}</div>`
}

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

Deno.serve(async (request) => {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!url || !serviceKey || !cronSecret) return new Response('Sin configurar', { status: 500 })
  if (request.headers.get('x-cron-secret') !== cronSecret) return new Response('No autorizado', { status: 401 })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const now = new Date()
  const today = isoDay(now)
  const soon = isoDay(new Date(now.getTime() + 3 * DAY))
  const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '')
  let sent = 0
  let failed = 0

  const { data: tenants } = await admin
    .from('tenants')
    .select('id, name, email, brand_color, email_from_name, email_signature')
    .eq('auto_reminders', true)

  for (const tenant of (tenants ?? []) as Row[]) {
    const company = String(tenant.name ?? '')
    const signature = String(tenant.email_signature ?? '').trim() || company
    const color = colorPattern.test(tenant.brand_color ?? '') ? tenant.brand_color : '#2a4227'
    const replyTo = emailPattern.test(tenant.email ?? '') ? tenant.email : undefined

    async function deliver(clientId: string, subject: string, body: (name: string) => string[]) {
      const { data: client } = await admin
        .from('clients')
        .select('name, email')
        .eq('id', clientId)
        .eq('tenant_id', tenant.id)
        .maybeSingle()
      const to = String(client?.email ?? '').trim()
      if (!emailPattern.test(to)) return false
      const text = [`Hola ${client?.name ?? ''},`, '', ...body(String(client?.name ?? '')), '', signature].join('\n')
      try {
        await sendEmail({
          to,
          subject,
          text,
          html: toHtml(text, color),
          fromName: String(tenant.email_from_name ?? '').trim() || company,
          replyTo,
        })
        sent++
        return true
      } catch (error) {
        // eslint-disable-next-line no-console -- único rastro del fallo de Resend en los logs de la función
        console.error('send-reminders: fallo de Resend', error instanceof Error ? error.message : 'desconocido')
        failed++
        return false
      }
    }

    // Facturas vencidas: la primera al pasar el vencimiento y luego cada 7 días.
    const { data: invoices } = await admin
      .from('invoices')
      .select('id, client_id, number, concept, total_cents, paid_cents, due_date, reminder_count, last_reminder_at')
      .eq('tenant_id', tenant.id)
      .in('status', ['issued', 'sent'])
      .lt('due_date', today)
      .lt('reminder_count', MAX_INVOICE_REMINDERS)
    for (const invoice of (invoices ?? []) as Row[]) {
      const owed = Number(invoice.total_cents) - Number(invoice.paid_cents)
      if (owed <= 0) continue
      const last = invoice.last_reminder_at ? new Date(invoice.last_reminder_at).getTime() : 0
      if (now.getTime() - last < 7 * DAY) continue
      const ok = await deliver(invoice.client_id, `Recordatorio: factura ${invoice.number} · ${company}`, () => [
        `Te recordamos que la factura ${invoice.number} por «${invoice.concept}» venció el ${invoice.due_date} y aún figura pendiente.`,
        `Importe pendiente: ${euros(owed)}.`,
        'Si ya la has pagado, ignora este mensaje. Gracias.',
      ])
      if (ok) {
        await admin
          .from('invoices')
          .update({ reminder_count: Number(invoice.reminder_count) + 1, last_reminder_at: now.toISOString() })
          .eq('id', invoice.id)
      }
    }

    // Presupuestos enviados hace 4 días o más sin respuesta (y que aún no están a punto de caducar,
    // porque entonces ya los cubre el aviso de abajo): un único seguimiento amable.
    const followupBefore = new Date(now.getTime() - 4 * DAY).toISOString()
    const { data: waiting } = await admin
      .from('estimates')
      .select('id, client_id, number, title, valid_until, public_token')
      .eq('tenant_id', tenant.id)
      .eq('status', 'sent')
      .gt('valid_until', soon)
      .lte('sent_at', followupBefore)
      .is('followup_sent_at', null)
    for (const estimate of (waiting ?? []) as Row[]) {
      const link = appUrl && estimate.public_token ? `${appUrl}/p/${estimate.public_token}` : ''
      const ok = await deliver(estimate.client_id, `¿Pudiste ver el presupuesto ${estimate.number}? · ${company}`, () => [
        `Hace unos días te enviamos el presupuesto ${estimate.number} para «${estimate.title}».`,
        'Si tienes cualquier duda o quieres ajustar algo, responde a este correo y lo vemos.',
        ...(link ? [`Puedes verlo y aceptarlo aquí: ${link}`] : []),
      ])
      if (ok) await admin.from('estimates').update({ followup_sent_at: now.toISOString() }).eq('id', estimate.id)
    }

    // Presupuestos enviados que están a punto de caducar: un solo aviso.
    const { data: estimates } = await admin
      .from('estimates')
      .select('id, client_id, number, title, valid_until, public_token')
      .eq('tenant_id', tenant.id)
      .eq('status', 'sent')
      .gte('valid_until', today)
      .lte('valid_until', soon)
      .is('reminder_sent_at', null)
    for (const estimate of (estimates ?? []) as Row[]) {
      const link = appUrl && estimate.public_token ? `${appUrl}/p/${estimate.public_token}` : ''
      const ok = await deliver(estimate.client_id, `Tu presupuesto ${estimate.number} caduca pronto · ${company}`, () => [
        `El presupuesto ${estimate.number} para «${estimate.title}» es válido hasta el ${estimate.valid_until}.`,
        ...(link ? [`Puedes verlo y aceptarlo aquí: ${link}`] : []),
      ])
      if (ok) await admin.from('estimates').update({ reminder_sent_at: now.toISOString() }).eq('id', estimate.id)
    }
  }
  return Response.json({ sent, failed })
})
