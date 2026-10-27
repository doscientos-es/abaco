/** Read-only customer view of one immutable visit report version. */
import { createClient } from 'npm:@supabase/supabase-js@2'

import { publicPhotoReferences, publicVisitReportSnapshot } from '../_shared/public-visit-report.ts'

const tokenPattern = /^[0-9a-f]{64}$/
const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_URL') ?? '',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
}

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return reply(500, { error: 'not_configured' })
  const input = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const token = typeof input?.token === 'string' ? input.token : ''
  if (!tokenPattern.test(token)) return reply(404, { error: 'not_found' })

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const tokenHash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: share, error: shareError } = await admin
    .from('service_visit_report_shares')
    .select('tenant_id,report_version_id,expires_at,revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (shareError) return reply(500, { error: 'lookup_failed' })
  if (!share || share.revoked_at || new Date(share.expires_at).getTime() <= Date.now()) {
    return reply(404, { error: 'not_found' })
  }

  const { data: version, error: versionError } = await admin
    .from('service_visit_report_versions')
    .select('version,closed_at,snapshot')
    .eq('id', share.report_version_id)
    .eq('tenant_id', share.tenant_id)
    .maybeSingle()
  if (versionError || !version) return reply(404, { error: 'not_found' })
  const photos = await Promise.all(
    publicPhotoReferences(version.snapshot).map(async (photo) => {
      const signed = await admin.storage
        .from('visit-photos')
        .createSignedUrl(photo.storagePath, 300)
      if (signed.error || !signed.data?.signedUrl) return null
      return {
        phase: photo.phase,
        caption: photo.caption,
        url: signed.data.signedUrl,
      }
    }),
  )

  return reply(
    200,
    publicVisitReportSnapshot(
      version.snapshot,
      version.version,
      version.closed_at,
      photos.filter((photo) => photo !== null),
    ),
  )
})
