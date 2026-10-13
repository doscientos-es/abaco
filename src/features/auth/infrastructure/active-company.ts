const KEY = 'abderrahim-presupuestos:active-company'

/** Company the user last worked in. Only a preference: it is checked against their memberships. */
export function getPreferredCompanyId(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setPreferredCompanyId(id: string): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Private mode: the first company is used next time.
  }
}
