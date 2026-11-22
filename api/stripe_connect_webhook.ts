import type { IncomingMessage, ServerResponse } from 'node:http'

import { createClient } from '@supabase/supabase-js'

import { receiveConnectEvent } from '../server/stripe-connect/webhook-ingress'
import { reply } from '../server/visit-report-pdf/http'

export const config = { api: { bodyParser: false } }

const maxBodyBytes = 1024 * 1024

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'POST') return reply(response, 405, { error: 'method_not_allowed' })
  const secretKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET
  const mode = process.env.STRIPE_CONNECT_MODE
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secretKey || !webhookSecret || !url || !key || (mode !== 'test' && mode !== 'live'))
    return reply(response, 503, { error: 'not_configured' })

  const declared = Number(request.headers['content-length'] ?? 0)
  if (!Number.isSafeInteger(declared) || declared < 0 || declared > maxBodyBytes)
    return reply(response, 413, { error: 'body_too_large' })
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    size += bytes.length
    if (size > maxBodyBytes) return reply(response, 413, { error: 'body_too_large' })
    chunks.push(bytes)
  }

  const signature = request.headers['stripe-signature']
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const result = await receiveConnectEvent(
    Buffer.concat(chunks),
    typeof signature === 'string' ? signature : '',
    { secretKey, webhookSecret, liveMode: mode === 'live' },
    {
      async enqueue(event) {
        const { error } = await admin.rpc('receive_stripe_connect_event', { p_event: event })
        if (error) throw new Error('Could not persist Stripe event')
      },
    },
  )
  if (result === 'accepted') return reply(response, 200, { received: true })
  return reply(response, result === 'invalid' ? 400 : 503, { error: result })
}
