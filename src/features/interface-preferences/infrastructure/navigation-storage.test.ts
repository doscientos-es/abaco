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

it('migrates legacy preferences for the same user and company', () => {
  const values = new Map<string, string>()
  const saved = { mobile: ['/facturas'], desktopGroups: ['finance'], desktopItems: [] }
  values.set('abaco:interface:v1:company:user', JSON.stringify(saved))
  vi.stubGlobal('window', {
    localStorage: { getItem: (key: string) => values.get(key), setItem: values.set.bind(values) },
  })
  const key = navigationStorageKey('company', 'user')
  expect(readNavigationPreferences(key)).toEqual(saved)
  expect(values.get(key)).toBe(JSON.stringify(saved))
  expect(readNavigationPreferences(navigationStorageKey('company', 'other'))).toEqual(
    defaultNavigationPreferences,
  )
  const updated = { ...saved, mobile: ['/clientes'] }
  writeNavigationPreferences(key, updated)
  expect(readNavigationPreferences(key)).toEqual(updated)
})
