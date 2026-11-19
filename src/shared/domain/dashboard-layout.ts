export const dashboardGridColumns = 12

export function dashboardModuleWidths(minimum: number) {
  return [3, 4, 6, 8, 9, dashboardGridColumns].filter((width) => width >= minimum)
}

export function snapDashboardWidth(value: unknown, minimum: number, fallback = minimum) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return dashboardModuleWidths(minimum).reduce((closest, width) => {
    return Math.abs(width - value) < Math.abs(closest - value) ? width : closest
  })
}

export type DashboardLayoutItem = { id: string; width: number }

export function moveDashboardModule<Item extends DashboardLayoutItem>(
  items: Item[],
  id: string | number,
  to: number,
): Item[] {
  const from = items.findIndex((item) => item.id === id)
  const item = items[from]
  if (!item || !Number.isInteger(to) || to < 0 || to >= items.length || from === to) return items
  const next = [...items]
  next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
