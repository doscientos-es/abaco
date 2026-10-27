import type { Role } from './permissions'

/** A UI preference only; never used to grant access or start/extend the trial. */
export const welcomePendingField = 'welcome_pending'

export function needsWelcome(role: Role | null, metadata: Record<string, unknown>): boolean {
  return role === 'owner' && metadata[welcomePendingField] === true
}
