import {
  defaultNavigationPreferences,
  parseNavigationPreferences,
  type NavigationPreferences,
} from '../domain/navigation-layout'

export function navigationStorageKey(tenantId: string, userId: string) {
  return `abaco:interface:v1:${tenantId}:${userId}`
}

export function readNavigationPreferences(key: string) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? parseNavigationPreferences(JSON.parse(raw)) : defaultNavigationPreferences
  } catch {
    return defaultNavigationPreferences
  }
}

export function writeNavigationPreferences(key: string, preferences: NavigationPreferences) {
  try {
    window.localStorage.setItem(key, JSON.stringify(preferences))
  } catch {
    // Keep the active layout usable when browser storage is unavailable.
  }
}
