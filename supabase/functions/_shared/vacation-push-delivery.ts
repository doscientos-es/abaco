export type PushTarget = { id: string; endpoint: string; p256dh: string; auth_key: string }

/** Only browser push services may receive server requests; arbitrary URLs are SSRF. */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    const host = url.hostname.toLowerCase()
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      (host === 'fcm.googleapis.com' ||
        host === 'android.googleapis.com' ||
        host === 'updates.push.services.mozilla.com' ||
        host.endsWith('.push.apple.com') ||
        host.endsWith('.notify.windows.com'))
    )
  } catch {
    return false
  }
}

export async function deliverVacationNotice(input: {
  targets: PushTarget[]
  sendPush: (target: PushTarget) => Promise<void>
  removeTarget: (id: string) => Promise<void>
  sendEmail: () => Promise<void>
}): Promise<'push' | 'email'> {
  let delivered = false
  for (const target of input.targets) {
    if (!isAllowedPushEndpoint(target.endpoint)) {
      await input.removeTarget(target.id)
      continue
    }
    try {
      await input.sendPush(target)
      delivered = true
    } catch (error) {
      const status = (error as { statusCode?: unknown })?.statusCode
      if (status === 404 || status === 410) await input.removeTarget(target.id)
    }
  }
  if (delivered) return 'push'
  await input.sendEmail()
  return 'email'
}