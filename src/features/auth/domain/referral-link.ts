const referralCodePattern = /^[A-F0-9]{16}$/

export function referralCodeFromSearch(search: string): string | null {
  const code = new URLSearchParams(search).get('r')?.trim().toUpperCase()
  return code && referralCodePattern.test(code) ? code : null
}

export function referralLink(origin: string, code: string): string {
  const url = new URL('/registro', origin)
  url.searchParams.set('r', code)
  return url.toString()
}
