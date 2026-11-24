import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import { signupSchema } from '../domain/credentials'
import { referralCodeFromSearch } from '../domain/referral-link'
import { welcomePendingField } from '../domain/welcome'
import { clearReferral } from './referral-actions'

const pendingKey = 'abaco.google-auth.pending'
type Signup = { fullName: string; companyName: string; referralCode?: string | null }
type Pending = { redirect: string; signup?: Signup }

/** Only local paths are allowed, including after reading browser storage. */
export function safeAuthRedirect(path: unknown): string {
  if (
    typeof path !== 'string' ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('\\')
  )
    return '/'
  try {
    const url = new URL(path, 'https://abaco.invalid')
    return url.origin === 'https://abaco.invalid' ? `${url.pathname}${url.search}${url.hash}` : '/'
  } catch {
    return '/'
  }
}

export async function startGoogleAuth(redirect?: string, signup?: Signup): Promise<void> {
  const pending: Pending = { redirect: safeAuthRedirect(redirect), ...(signup ? { signup } : {}) }
  sessionStorage.setItem(pendingKey, JSON.stringify(pending))
  try {
    const { error } = await createBrowserSupabaseClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/acceso-google` },
    })
    if (error) throw error
  } catch (error) {
    sessionStorage.removeItem(pendingKey)
    throw error
  }
}

/** Exchange the PKCE code first; never use signup data to modify an existing membership. */
export async function finishGoogleAuth(code: string): Promise<string> {
  const raw = sessionStorage.getItem(pendingKey)
  sessionStorage.removeItem(pendingKey)
  if (!raw || !code || code.length > 4096) throw new Error('Invalid OAuth return')
  const pending = JSON.parse(raw) as Pending
  const supabase = createBrowserSupabaseClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.session?.user) throw new Error('OAuth exchange failed')

  if (pending.signup) {
    const signup = signupSchema
      .pick({ fullName: true, companyName: true })
      .safeParse(pending.signup)
    if (!signup.success) throw new Error('Invalid signup details')
    const memberships = await supabase.rpc('my_company_memberships')
    if (memberships.error || !Array.isArray(memberships.data))
      throw new Error('Could not check company memberships')
    if (memberships.data.length === 0) {
      const referral = referralCodeFromSearch(
        `?r=${encodeURIComponent(pending.signup.referralCode ?? '')}`,
      )
      const metadata = data.session.user.user_metadata ?? {}
      if (!metadata.full_name) {
        // The signup trigger copies Google's name into profiles; fill only a missing name.
        const profile = await supabase
          .from('profiles')
          .update({ full_name: signup.data.fullName })
          .eq('id', data.session.user.id)
          .eq('full_name', '')
        if (profile.error) throw new Error('Could not complete the profile')
      }
      const result = await supabase.auth.updateUser({
        data: {
          ...(!metadata.full_name ? { full_name: signup.data.fullName } : {}),
          company_name: signup.data.companyName,
          [welcomePendingField]: true,
          ...(referral ? { abaco_referral_code: referral } : {}),
        },
      })
      if (result.error) throw new Error('Could not finish signup')
    }
    clearReferral()
  }
  return safeAuthRedirect(pending.redirect)
}
