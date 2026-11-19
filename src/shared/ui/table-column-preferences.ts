export type TableColumn = {
  id: string
  label: string
  required?: boolean
  available?: boolean
  headClassName?: string
}

export type ColumnPreferences = { order: string[]; hidden: string[] }

/** Reconcile stored preferences with the current schema, including newly added columns. */
export function resolveColumnPreferences(
  columns: readonly TableColumn[],
  value: unknown,
): ColumnPreferences {
  const saved = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const ids = columns.map((column) => column.id)
  const order = Array.isArray(saved.order)
    ? saved.order.filter((id): id is string => typeof id === 'string' && ids.includes(id))
    : []
  const unique = [...new Set(order)]
  const hidden = Array.isArray(saved.hidden)
    ? saved.hidden.filter(
        (id): id is string =>
          typeof id === 'string' && columns.some((column) => column.id === id && !column.required),
      )
    : []
  return {
    order: [...unique, ...ids.filter((id) => !unique.includes(id))],
    hidden: [...new Set(hidden)],
  }
}

/** Move among available columns without discarding preferences for temporarily unavailable ones. */
export function moveTableColumn(
  preferences: ColumnPreferences,
  id: string,
  direction: -1 | 1,
  available: readonly string[],
): ColumnPreferences {
  const visibleOrder = preferences.order.filter((item) => available.includes(item))
  const target = visibleOrder[visibleOrder.indexOf(id) + direction]
  if (!target || !available.includes(id)) return preferences
  const order = [...preferences.order]
  const fromIndex = order.indexOf(id)
  const targetIndex = order.indexOf(target)
  order[fromIndex] = target
  order[targetIndex] = id
  return { ...preferences, order }
}

export function readColumnPreferences(
  key: string,
  columns: readonly TableColumn[],
): ColumnPreferences {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(key)
    return resolveColumnPreferences(columns, raw ? JSON.parse(raw) : null)
  } catch {
    return resolveColumnPreferences(columns, null)
  }
}

export function writeColumnPreferences(key: string, preferences: ColumnPreferences): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(preferences))
  } catch {
    // Storage may be blocked; the current session remains usable.
  }
}
