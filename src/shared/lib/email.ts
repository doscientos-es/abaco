/** Builds a mailto link with the subject and body prefilled. The user's mail app sends it. */
export function mailtoLink(to: string, subject: string, body: string): string {
  const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  return `mailto:${encodeURIComponent(to)}?${query}`
}

export function openEmail(to: string, subject: string, body: string): void {
  window.location.href = mailtoLink(to, subject, body)
}
