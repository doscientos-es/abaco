import { useState } from 'react'

import { moveDashboardModule, type DashboardLayoutItem } from '@/shared/domain/dashboard-layout'

export type DashboardLayout = { modules: DashboardLayoutItem[] }
type Module<Layout extends DashboardLayout> = Layout['modules'][number]

/** Owns the edit session; each dashboard provides its own persistence and module defaults. */
export function useDashboardLayout<Layout extends DashboardLayout>({
  saved,
  defaults,
  createModule,
  onSave,
  enabled = true,
}: {
  saved: Layout
  defaults: () => Layout
  createModule: (id: Module<Layout>['id']) => Module<Layout>
  onSave: (next: Layout) => void
  enabled?: boolean
}) {
  const [draft, setDraft] = useState<Layout | null>(null)
  const [savedOnce, setSavedOnce] = useState(false)
  const editing = enabled && draft !== null
  const layout = editing ? draft : saved
  const changed = editing && JSON.stringify(draft) !== JSON.stringify(saved)

  function update(change: (current: Layout) => Layout) {
    if (enabled) setDraft((current) => (current ? change(current) : current))
  }

  function updateModules(change: (items: Layout['modules']) => Layout['modules']) {
    update((current) => ({ ...current, modules: change(current.modules) }))
  }

  function changeModule(
    id: Module<Layout>['id'],
    change: (item: Module<Layout>) => Module<Layout>,
  ) {
    updateModules((items) => items.map((item) => (item.id === id ? change(item) : item)))
  }

  function persist(next: Layout) {
    onSave(next)
    setDraft(null)
    setSavedOnce(true)
  }

  return {
    layout,
    enabled,
    editing,
    changed,
    savedOnce,
    start: () => {
      if (!enabled) return
      setSavedOnce(false)
      setDraft(saved)
    },
    cancel: () => setDraft(null),
    restore: () => update(defaults),
    save: () => {
      if (changed) persist(draft)
    },
    add: (id: Module<Layout>['id']) => {
      if (!enabled || layout.modules.some((module) => module.id === id)) return
      const append = (current: Layout): Layout =>
        current.modules.some((module) => module.id === id)
          ? current
          : { ...current, modules: [...current.modules, createModule(id)] }
      if (editing) update(append)
      else persist(append(saved))
    },
    move: (id: string | number, index: number) =>
      update((current) => ({
        ...current,
        modules: moveDashboardModule(current.modules, id, index),
      })),
    remove: (id: Module<Layout>['id']) =>
      updateModules((items) => items.filter((item) => item.id !== id)),
    changeModule,
    resize: (id: Module<Layout>['id'], width: number) =>
      changeModule(id, (item) => ({ ...item, width })),
    update,
  }
}

export type DashboardLayoutController<Layout extends DashboardLayout> = ReturnType<
  typeof useDashboardLayout<Layout>
>
