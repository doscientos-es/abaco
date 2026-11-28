import { handleInterventionRequest } from '../server/intervention-intake/http.js'

const windowMs = 60_000
const emergencyLimit = 10
// Per isolate, not a shared edge limit. Keep only ten aggregate timestamps, never IPs.
const admissions = Array.from({ length: emergencyLimit }, () => -Infinity)
let cursor = 0
const lastDiagnostic = new Map()

function reportOperationalProblem(reason, status) {
  const now = Date.now()
  if (now - (lastDiagnostic.get(reason) ?? -Infinity) < windowMs) return
  lastDiagnostic.set(reason, now)
  // oxlint-disable-next-line no-console -- Fixed diagnostic fields only; never log the request or exception.
  console.warn('intervention_intake', reason, ...(status === undefined ? [] : [status]))
}

function emergencyAdmission(reason) {
  reportOperationalProblem(reason)
  const now = Date.now()
  if (now - admissions[cursor] < windowMs) return false
  admissions[cursor] = now
  cursor = (cursor + 1) % emergencyLimit
  return true
}

export function interventionIntake(request, env, fetcher = fetch) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  let appOrigin
  try {
    appOrigin = new URL(env.APP_URL).origin
  } catch {
    // An unconfigured deployment must fail closed instead of trusting the request URL.
  }
  return handleInterventionRequest(request, {
    appOrigin,
    images: env.IMAGES,
    async allowRequest(incoming) {
      const ip = incoming.headers.get('cf-connecting-ip')?.trim()
      // Never substitute an untrusted header. Keep the true native denial authoritative.
      if (!ip || ip.length > 64 || !/^[0-9a-f:.]+$/i.test(ip))
        return emergencyAdmission('edge_client_ip_unavailable')
      if (!env.INTERVENTION_IP_LIMITER) return emergencyAdmission('edge_rate_binding_unavailable')
      try {
        const { success } = await env.INTERVENTION_IP_LIMITER.limit({ key: `intake:${ip}` })
        if (typeof success === 'boolean') return success
      } catch {
        // The native binding could not make a decision; the emergency cap still applies.
      }
      return emergencyAdmission('edge_rate_binding_failed')
    },
    async rpc(name, params) {
      if (typeof url !== 'string' || !url || typeof key !== 'string' || !key) {
        reportOperationalProblem('rpc_not_configured')
        throw new Error('Intake unavailable')
      }
      const headers = { 'Content-Type': 'application/json', apikey: key }
      // Opaque server keys belong only in apikey; legacy service_role JWTs also use Bearer.
      if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`
      try {
        const endpoint = new URL(`/rest/v1/rpc/${name}`, url)
        const response = await fetcher(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(params),
          cache: 'no-store',
          redirect: 'manual',
          signal: AbortSignal.timeout(8_000),
        })
        if (!response.ok) {
          reportOperationalProblem('rpc_http_error', response.status)
        } else {
          return await response.json()
        }
      } catch {
        reportOperationalProblem('rpc_transport_error')
      }
      throw new Error('Intake unavailable')
    },
  })
}
