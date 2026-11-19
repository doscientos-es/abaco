import { describe, expect, it } from 'vitest'

import {
  chooseShortcut,
  defaultNavigationPreferences,
  moveNavigationItem,
  parseNavigationPreferences,
  resolveNavigationLayout,
} from './navigation-layout'

const destination = (to: string) => ({ to, label: to })
const home = destination('/')
const clients = destination('/clientes')
const estimates = destination('/presupuestos')
const work = destination('/trabajos')
const invoices = destination('/facturas')
const ledger = destination('/contabilidad')
const groups = [
  { id: 'general', label: 'General', items: [home] },
  { id: 'sales', label: 'Ventas', items: [estimates, clients] },
  { id: 'finance', label: 'Finanzas', items: [invoices, ledger] },
]
const choices = groups.flatMap((group) => group.items)
const defaults = [home.to, clients.to, work.to, estimates.to]

describe('navigation layout', () => {
  it('cleans duplicate, malformed and excess values from stored settings', () => {
    expect(
      parseNavigationPreferences({
        mobile: [invoices.to, invoices.to, false, home.to, clients.to, estimates.to, work.to],
        desktopItems: [null, work.to, work.to],
        desktopGroups: 'invalid',
      }),
    ).toEqual({
      mobile: [invoices.to, home.to, clients.to, estimates.to],
      desktopGroups: [],
      desktopItems: [work.to],
    })
  })

  it('uses defaults to fill slots and ignores unavailable links even when saved explicitly', () => {
    const layout = resolveNavigationLayout(groups, choices, defaults, {
      ...defaultNavigationPreferences,
      mobile: [work.to, ledger.to, ledger.to],
    })
    expect(layout.mobile).toEqual([ledger, home, clients, estimates])
  })

  it('swaps existing shortcuts or replaces a slot without altering the original row', () => {
    expect(chooseShortcut(defaults, 1, estimates.to)).toEqual([
      home.to,
      estimates.to,
      work.to,
      clients.to,
    ])
    expect(chooseShortcut(defaults, 1, ledger.to)).toEqual([
      home.to,
      ledger.to,
      work.to,
      estimates.to,
    ])
    expect(defaults[1]).toBe(clients.to)
  })

  it('reorders desktop groups and their own items, leaving newly available sections in default order', () => {
    const layout = resolveNavigationLayout(groups, choices, defaults, {
      ...defaultNavigationPreferences,
      desktopGroups: ['finance', 'retired', 'general'],
      desktopItems: moveNavigationItem([invoices.to, ledger.to], 1, -1),
    })
    expect(layout.desktop.map((group) => group.id)).toEqual(['finance', 'general', 'sales'])
    expect(layout.desktop.map((group) => group.items)).toEqual([
      [ledger, invoices],
      [home],
      [estimates, clients],
    ])
  })
})
