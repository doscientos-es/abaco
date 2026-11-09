import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

import { isCronAuthorized } from '../_shared/cron-auth.ts'
import { sendEmail } from '../_shared/resend.ts'
import { deliverVacationNotice } from '../_shared/vacation-push-delivery.ts'

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || !isCronAuthorized(request, secret)) return new Response(null, { status: 401 })
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const appUrl = Deno.env.get('APP_URL')
  if (!url || !key || !appUrl) return new Response('Sin configurar', { status: 503 })
  const admin = createClient(url, key, { auth: { persistSession: false } })
  let processed = 0
  while (processed < 20) {
    const { data, error } = await admin.rpc('claim_vacation_notification_job')
    if (error) return Response.json({ processed, error: 'claim_failed' }, { status: 502 })
    const job = data?.[0]
    if (!job) break
    let channel: 'push' | 'email' | 'skipped' | null = null
    try {
      const notice = await admin.from('vacation_decision_notifications')
        .select('recipient_id, tenant_id').eq('id', job.notification_id).maybeSingle()
      if (notice.error) throw notice.error
      if (!notice.data) throw new Error('notice_missing')
      const membership = await admin.from('memberships').select('user_id')
        .eq('tenant_id', notice.data.tenant_id).eq('user_id', notice.data.recipient_id).maybeSingle()
      if (membership.error) throw membership.error
      if (!membership.data) {
        channel = 'skipped'
      } else {
        const [subscriptions, profile] = await Promise.all([
          admin.from('vacation_push_subscriptions').select('id, endpoint, p256dh, auth_key')
            .eq('user_id', notice.data.recipient_id),
          admin.from('profiles').select('email').eq('id', notice.data.recipient_id).single(),
        ])
        if (subscriptions.error || profile.error) throw new Error('recipient_lookup_failed')
        channel = await deliverVacationNotice({
          targets: subscriptions.data ?? [],
          sendPush: async (target) => {
            const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
            const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
            const subject = Deno.env.get('VAPID_SUBJECT')
            if (!publicKey || !privateKey || !subject) throw new Error('push_not_configured')
            await webpush.sendNotification(
              { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth_key } },
              JSON.stringify({ title: 'Ábaco', body: 'Tienes un nuevo aviso en Ábaco.' }),
              { vapidDetails: { subject, publicKey, privateKey }, TTL: 86400, timeout: 15000 },
            )
          },
          removeTarget: async (id) => {
            const { error } = await admin.from('vacation_push_subscriptions').delete().eq('id', id)
            if (error) throw error
          },
          sendEmail: async () => {
            if (!profile.data.email) throw new Error('email_missing')
            const link = new URL('/mis-vacaciones', appUrl).toString()
            await sendEmail({
              to: profile.data.email,
              subject: 'Tienes un aviso en Ábaco',
              html: '<p>Tienes un aviso nuevo en Ábaco. Entra en la aplicación para consultarlo.</p>',
              text: `Tienes un aviso nuevo en Ábaco. Entra para consultarlo: ${link}`,
              idempotencyKey: `vacation-notice/${job.notification_id}`,
            })
          },
        })
      }
    } catch {
      // Do not log recipients, endpoints, payloads or provider responses.
    }
    const finished = await admin.rpc('finish_vacation_notification_job', {
      p_id: job.notification_id, p_token: job.lease_token, p_channel: channel,
      p_error: channel ? null : 'delivery_failed',
    })
    if (finished.error || !finished.data) return Response.json({ processed, error: 'finish_failed' }, { status: 502 })
    processed++
  }
  return Response.json({ processed })
})