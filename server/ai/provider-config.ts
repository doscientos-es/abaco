export type AiConfig = { provider: 'google' | 'openai'; model: string; apiKey: string }

/** Existing deployments keep using Gemini until explicitly configured otherwise. */
export function aiConfig(env: NodeJS.ProcessEnv): AiConfig | null {
  const provider = env.AI_PROVIDER?.trim() || 'google'
  if (provider !== 'google' && provider !== 'openai') return null
  const model = env.AI_MODEL?.trim() || (provider === 'google' ? 'gemini-3.1-flash-lite' : '')
  const apiKey = (provider === 'google' ? env.GEMINI_API_KEY : env.OPENAI_API_KEY)?.trim()
  if (!apiKey || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(model)) return null
  return { provider, model, apiKey }
}
