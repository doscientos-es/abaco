import { referralCodeFromSearch } from '../domain/referral-link'

const key = 'abaco.referral-code'
let memoryCode: string | null = null
let ignoreStoredCode = false

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Keep the most recent valid invitation until signup, even if navigation removes the query. */
export function rememberReferral(search: string): string | null {
  const code = referralCodeFromSearch(search)
  const store = storage()
  if (code) {
    memoryCode = code
    try {
      if (store) {
        store.setItem(key, code)
        ignoreStoredCode = false
      }
    } catch {
      // Storage can be disabled; the in-memory fallback still covers this session.
    }
    return code
  }
  if (ignoreStoredCode) return memoryCode
  try {
    const saved = store?.getItem(key)
    const valid = saved ? referralCodeFromSearch(`?r=${encodeURIComponent(saved)}`) : null
    return memoryCode ?? valid
  } catch {
    return memoryCode
  }
}

export function clearReferral(): void {
  memoryCode = null
  ignoreStoredCode = true
  try {
    const store = storage()
    if (store) {
      store.removeItem(key)
      ignoreStoredCode = false
    }
  } catch {
    // Signup has already recorded the invitation in account metadata.
  }
}
