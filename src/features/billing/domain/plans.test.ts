import { describe, expect, it } from 'vitest'

import {
  memberLimit,
  paidPlans,
  perMonthWhenYearlyAmount,
  perMonthWhenYearly,
  planCatalog,
  planInfo,
  scalePlanMonthlyPrice,
  smallestPlanFor,
  TRIAL_DAYS,
  TRIAL_MEMBERS,
} from './plans'

describe('current commercial offer', () => {
  it('keeps three paid plans with the existing prices and team limits', () => {
    expect(paidPlans).toEqual(['solo', 'team', 'business'])
    expect(
      planCatalog.map(({ id, members, monthly, yearly }) => ({ id, members, monthly, yearly })),
    ).toEqual([
      { id: 'solo', members: 1, monthly: 20, yearly: 200 },
      { id: 'team', members: 5, monthly: 34, yearly: 340 },
      { id: 'business', members: 15, monthly: 54, yearly: 540 },
    ])
  })

  it('shows annual prices as monthly equivalents, not monthly charges', () => {
    expect(planCatalog.map(perMonthWhenYearly)).toEqual([16.67, 28.33, 45])
    for (const plan of planCatalog) expect(plan.yearly).toBe(plan.monthly * 10)
    expect(perMonthWhenYearlyAmount(570)).toBe(47.5)
  })

  it('calculates the indicative Escala price only for teams from 16 to 100', () => {
    expect(scalePlanMonthlyPrice(15)).toBeNull()
    expect(scalePlanMonthlyPrice(16)).toBe(57)
    expect(scalePlanMonthlyPrice(17)).toBe(60)
    expect(scalePlanMonthlyPrice(100)).toBe(309)
    expect(scalePlanMonthlyPrice(101)).toBeNull()
    expect(scalePlanMonthlyPrice(16.5)).toBeNull()
  })

  it.each([
    [1, 'solo'],
    [2, 'team'],
    [5, 'team'],
    [6, 'business'],
    [15, 'business'],
    [16, null],
  ] as const)('recommends the smallest fitting plan for %i people', (members, expected) => {
    expect(smallestPlanFor(members)?.id ?? null).toBe(expected)
  })

  it('keeps the fourteen-day trial at the largest team limit', () => {
    expect(TRIAL_DAYS).toBe(14)
    expect(TRIAL_MEMBERS).toBe(15)
    expect(memberLimit('trial')).toBe(memberLimit('business'))
    expect(planInfo('trial')).toBeNull()
  })
})
