import { afterEach, expect, it, vi } from 'vitest'

import { defaultNavigationPreferences } from '../domain/navigation-layout'
import {
  navigationStorageKey,
  readNavigationPreferences,
  writeNavigationPreferences,
} from './navigation-storage'

afterEach(() => vi.unstubAllGlobals())

it('restores preferences only for the account and company that wrote them', () => {
  const values = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: { getItem: (key: string) => values.get(key), setItem: values.set.bind(values) },
  })
  const key = navigationStorageKey('company-one', 'user-one')
  const prefs = { mobile: ['/facturas'], desktopGroups: ['finance'], desktopItems: [] }
  writeNavigationPreferences(key, prefs)
  expect(readNavigationPreferences(key)).toEqual(prefs)
  expect(readNavigationPreferences(navigationStorageKey('company-two', 'user-one'))).toEqual(
    defaultNavigationPreferences,
  )
  expect(readNavigationPreferences(navigationStorageKey('company-one', 'user-two'))).toEqual(
    defaultNavigationPreferences,
  )
})

it('falls back for corrupted data and keeps navigation usable when storage is blocked', () => {
  vi.stubGlobal('window', { localStorage: { getItem: () => '{invalid' } })
  expect(readNavigationPreferences('test')).toEqual(defaultNavigationPreferences)
  vi.stubGlobal('window', {
    get localStorage() {
      throw new Error('Storage unavailable')
    },
  })
  expect(readNavigationPreferences('test')).toEqual(defaultNavigationPreferences)
  expect(() => writeNavigationPreferences('test', defaultNavigationPreferences)).not.toThrow()
})
