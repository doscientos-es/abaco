/**
 * Resumen semanal para el propietario. Se lanza cada lunes (cron) con la cabecera `x-cron-secret`
 * igual al secreto CRON_SECRET. Despliegue con --no-verify-jwt.
 *
 * Solo actúa en empresas con `tenants.weekly_summary = true` y con email. Si no hay nada que contar, no envía.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

import { sendEmail } from '../_shared/resend.ts'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DAY = 24 * 60 * 60 * 1000

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const euros = (cents: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100)
const isoDay = (date: Date) => date.toISOString().slice(0, 10)

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

Deno.serve(async (request) => {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!url || !serviceKey || !cronSecret) return new Response('Sin configurar', { status: 500 })
  if (request.headers.get('x-cron-secret') !== cronSecret)
    return new Response('No autorizado', { status: 401 })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const now = new Date()
  const today = isoDay(now)
  const weekAgo = isoDay(new Date(now.getTime() - 7 * DAY))
  const weekAhead = isoDay(new Date(now.getTime() + 7 * DAY))
  const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '')
  let sent = 0
  let failed = 0

  const { data: tenants } = await admin
    .from('tenants')
    .select('id, name, email')
    .eq('weekly_summary', true)

  for (const tenant of (tenants ?? []) as Row[]) {
    const to = String(tenant.email ?? '').trim()
    if (!emailPattern.test(to)) continue

    const [{ data: invoices }, { data: estimates }] = await Promise.all([
      admin
        .from('invoices')
        .select('total_cents, paid_cents, status, issued_at, due_date')
        .eq('tenant_id', tenant.id),
      admin
        .from('estimates')
        .select('status, valid_until, responded_at')
        .eq('tenant_id', tenant.id),
    ])

    let invoicedWeek = 0
    let pendingCents = 0
    let pendingCount = 0
    let overdueCents = 0
    let overdueCount = 0
    for (const inv of (invoices ?? []) as Row[]) {
      if (String(inv.issued_at) >= weekAgo) invoicedWeek += Number(inv.total_cents)
      const owed = Number(inv.total_cents) - Number(inv.paid_cents)
      if (inv.status === 'paid' || owed <= 0) continue
      pendingCents += owed
      pendingCount += 1
      if (String(inv.due_date) < today) {
        overdueCents += owed
        overdueCount += 1
      }
    }
    const open = ((estimates ?? []) as Row[]).filter(
      (e) => e.status === 'sent' && String(e.valid_until) >= today,
    )
    const expiring = open.filter((e) => String(e.valid_until) <= weekAhead).length
    const answered = ((estimates ?? []) as Row[]).filter(
      (e) => e.responded_at && String(e.responded_at).slice(0, 10) >= weekAgo,
    )
    const accepted = answered.filter((e) => e.status === 'accepted').length

    if (!invoicedWeek && !pendingCount && !open.length && !answered.length) continue

    const lines = [
      `Facturado esta semana: ${euros(invoicedWeek)}`,
      `Pendiente de cobro: ${euros(pendingCents)} (${pendingCount} ${pendingCount === 1 ? 'factura' : 'facturas'})`,
      ...(overdueCount ? [`De ellas, vencidas: ${euros(overdueCents)} (${overdueCount})`] : []),
      `Presupuestos esperando respuesta: ${open.length}${expiring ? ` (${expiring} caducan en 7 días)` : ''}`,
      `Respondidos esta semana: ${answered.length}${answered.length ? ` (${accepted} aceptados)` : ''}`,
    ]
    const text = [
      `Resumen de la semana de ${tenant.name}`,
      '',
      ...lines,
      ...(appUrl ? ['', appUrl] : []),
    ].join('\n')
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a"><h2 style="font-size:17px;margin:0 0 12px">Resumen de la semana</h2>${lines
      .map((line) => `<p style="margin:0 0 6px">${escapeHtml(line)}</p>`)
      .join(
        '',
      )}${appUrl ? `<p style="margin-top:16px"><a href="${escapeHtml(appUrl)}">Abrir Ábaco</a></p>` : ''}</div>`
    try {
      await sendEmail({
        to,
        subject: `Tu resumen semanal · ${tenant.name}`,
        html,
        text,
        fromName: 'Ábaco',
      })
      sent += 1
    } catch (error) {
      failed += 1
      // eslint-disable-next-line no-console -- único rastro del fallo de Resend en los logs de la función
      console.error(
        'weekly-summary: fallo de Resend',
        error instanceof Error ? error.message : 'desconocido',
      )
    }
  }
  return Response.json({ sent, failed })
})
