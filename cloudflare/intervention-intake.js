import { createClient } from '@supabase/supabase-js'

import { handleInterventionRequest } from '../server/intervention-intake/http.js'

export function interventionIntake(request, env) {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
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
      // Taken only from the trusted Cloudflare connection header; never from caller JSON.
      if (!env.INTERVENTION_IP_LIMITER || !ip || ip.length > 64 || !/^[0-9a-f:.]+$/i.test(ip))
        throw new Error('Intake perimeter unavailable')
      return (await env.INTERVENTION_IP_LIMITER.limit({ key: `intake:${ip}` })).success
    },
    async rpc(name, params) {
      if (!url || !key) throw new Error('Intake unavailable')
      const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { data, error } = await supabase.rpc(name, params)
      if (error) throw new Error('Intake unavailable')
      return data
    },
  })
}
