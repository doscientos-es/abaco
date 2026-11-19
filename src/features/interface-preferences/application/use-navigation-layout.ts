import { createContext, useMemo, useState } from 'react'

import {
  chooseShortcut,
  resolveNavigationLayout,
  type Destination,
  type NavigationGroup,
  type NavigationPreferences,
} from '../domain/navigation-layout'
import {
  navigationStorageKey,
  readNavigationPreferences,
  writeNavigationPreferences,
} from '../infrastructure/navigation-storage'

type NavigationLayout = {
  mobile: readonly Destination[]
  desktop: readonly NavigationGroup[]
  choices: readonly Destination[]
  setShortcut: (index: number, to: string) => void
  setDesktopGroups: (ids: string[]) => void
  setDesktopItems: (ids: string[]) => void
  resetMobile: () => void
  resetDesktop: () => void
}

export const NavigationLayoutContext = createContext<NavigationLayout | null>(null)

function keepHiddenOrder(ids: string[], previous: readonly string[]) {
  const changed = new Set(ids)
  return [...ids, ...previous.filter((id) => !changed.has(id))]
}

export function useNavigationLayout<T extends Destination>({
  tenantId,
  userId,
  groups,
  choices,
  mobileDefaults = [],
}: {
  tenantId: string
  userId: string
  groups: readonly NavigationGroup<T>[]
  choices: readonly T[]
  mobileDefaults?: readonly string[]
}) {
  const key = navigationStorageKey(tenantId, userId)
  const stored = useMemo(() => readNavigationPreferences(key), [key])
  const [edited, setEdited] = useState<{ key: string; prefs: NavigationPreferences }>()
  const prefs = edited?.key === key ? edited.prefs : stored
  const layout = resolveNavigationLayout(groups, choices, mobileDefaults, prefs)

  function update(patch: Partial<NavigationPreferences>) {
    const next = { ...prefs, ...patch }
    writeNavigationPreferences(key, next)
    setEdited({ key, prefs: next })
  }

  return {
    ...layout,
    choices,
    setShortcut(index: number, to: string) {
      if (!choices.some((item) => item.to === to)) return
      update({
        mobile: chooseShortcut(
          layout.mobile.map((item) => item.to),
          index,
          to,
        ),
      })
    },
    setDesktopGroups(ids: string[]) {
      update({ desktopGroups: keepHiddenOrder(ids, prefs.desktopGroups) })
    },
    setDesktopItems(ids: string[]) {
      update({ desktopItems: keepHiddenOrder(ids, prefs.desktopItems) })
    },
    resetMobile: () => update({ mobile: [] }),
    resetDesktop: () => update({ desktopGroups: [], desktopItems: [] }),
  }
}
