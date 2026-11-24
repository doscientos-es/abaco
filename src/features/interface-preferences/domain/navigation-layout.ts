export type Destination = { to: string; label: string }
export type NavigationGroup<T extends Destination = Destination> = {
  id: string
  label: string
  items: readonly T[]
}

export type NavigationPreferences = {
  mobile: string[]
  desktopGroups: string[]
  desktopItems: string[]
}

const mobileShortcutLimit = 4

export const defaultNavigationPreferences: NavigationPreferences = {
  mobile: [],
  desktopGroups: [],
  desktopItems: [],
}

function readOrder(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === 'string'))] : []
}

export function parseNavigationPreferences(value: unknown): NavigationPreferences {
  if (!value || typeof value !== 'object') return defaultNavigationPreferences
  const prefs = value as Partial<Record<keyof NavigationPreferences, unknown>>
  return {
    mobile: readOrder(prefs.mobile).slice(0, mobileShortcutLimit),
    desktopGroups: readOrder(prefs.desktopGroups),
    desktopItems: readOrder(prefs.desktopItems),
  }
}

function orderBy<T>(items: readonly T[], order: readonly string[], id: (item: T) => string): T[] {
  const remaining = new Map(items.map((item) => [id(item), item]))
  const ordered: T[] = []
  for (const key of order) {
    const item = remaining.get(key)
    if (item !== undefined) ordered.push(item)
    remaining.delete(key)
  }
  return [...ordered, ...remaining.values()]
}

export function resolveNavigationLayout<T extends Destination>(
  groups: readonly NavigationGroup<T>[],
  choices: readonly T[],
  mobileDefaults: readonly string[],
  prefs: NavigationPreferences,
) {
  return {
    mobile: orderBy(choices, [...prefs.mobile, ...mobileDefaults], (item) => item.to).slice(
      0,
      mobileShortcutLimit,
    ),
    desktop: orderBy(groups, prefs.desktopGroups, (group) => group.id).map((group) => ({
      ...group,
      items: orderBy(group.items, prefs.desktopItems, (item) => item.to),
    })),
  }
}

export function chooseShortcut(current: readonly string[], index: number, choice: string) {
  const displaced = current[index]
  if (displaced === undefined) return [...current]
  const next = [...current]
  const existing = next.indexOf(choice)
  next[index] = choice
  if (existing >= 0) next[existing] = displaced
  return next
}

export function reorderShortcuts(current: string[], to: string, index: number) {
  const from = current.indexOf(to)
  if (
    from < 0 ||
    index === from ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= current.length
  )
    return current

  const next = [...current]
  next.splice(from, 1)
  next.splice(index, 0, to)
  return next
}

export function moveNavigationItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const destination = index + direction
  return items.map((item, position) => {
    if (position === index) return items[destination] ?? item
    if (position === destination) return items[index] ?? item
    return item
  })
}
