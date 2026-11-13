import { describe, expect, it } from 'vitest'

import { shortcutCommand } from './keyboard-shortcuts'

const event = (key: string, changes: Partial<KeyboardEvent> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  isComposing: false,
  repeat: false,
  defaultPrevented: false,
  ...changes,
})

describe('workspace keyboard shortcuts', () => {
  it('allows the explicit global search shortcut on both platforms, including while typing', () => {
    expect(shortcutCommand(event('k', { ctrlKey: true }), true, false)).toBe('search')
    expect(shortcutCommand(event('K', { metaKey: true }), false, false)).toBe('search')
    expect(shortcutCommand(event('k', { ctrlKey: true, shiftKey: true }), false, false)).toBeNull()
  })

  it('never steals ordinary keys from form fields, dialogs, composition or browser commands', () => {
    for (const key of ['g', 'c', '?', '/']) {
      expect(shortcutCommand(event(key), true, false)).toBeNull()
      expect(shortcutCommand(event(key), false, true)).toBeNull()
      expect(shortcutCommand(event(key, { isComposing: true }), false, false)).toBeNull()
      expect(shortcutCommand(event(key, { ctrlKey: true }), false, false)).toBeNull()
      expect(shortcutCommand(event(key, { altKey: true }), false, false)).toBeNull()
    }
    expect(shortcutCommand(event('k', { ctrlKey: true, repeat: true }), false, false)).toBeNull()
    expect(
      shortcutCommand(event('k', { ctrlKey: true, defaultPrevented: true }), false, false),
    ).toBeNull()
  })

  it('exposes discoverable local search, help and go-to sequences', () => {
    expect(shortcutCommand(event('/'), false, false)).toBe('filter')
    expect(shortcutCommand(event('?'), false, false)).toBe('help')
    expect(shortcutCommand(event('g'), false, false)).toBe('prefix')
    expect(shortcutCommand(event('c'), false, false)).toBe('c')
  })
})
