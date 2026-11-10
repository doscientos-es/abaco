import { describe, expect, it } from 'vitest'

import { contractJobError, emptyContractJob, normalizeContractJob } from './contract-job'

function validJob() {
  return {
    ...emptyContractJob('2026-12-01'),
    title: 'Cristales',
    tasks: 'Limpiar ventanas',
    location_id: 'center',
  }
}

describe('contracted job configuration', () => {
  it('requires a centre and scope rather than silently scheduling quoted placeholders', () => {
    expect(contractJobError(emptyContractJob('2026-12-01'), '2026-12-01', null)).toBeTruthy()
    expect(contractJobError({ ...validJob(), location_id: null }, '2026-12-01', null)).toBe(
      'Selecciona un centro.',
    )
    expect(contractJobError(validJob(), '2026-12-01', null)).toBeNull()
  })

  it('distinguishes one-off orders from recurring permanent sheets', () => {
    expect(contractJobError({ ...validJob(), modality: 'fixed' }, '2026-12-01', null)).toBeTruthy()
    expect(
      contractJobError(
        {
          ...validJob(),
          frequency: 'weekly',
          modality: 'fixed',
          weekdays: [1, 3, 5],
          weekly_slots: [1, 3, 5].map((weekday) => ({
            id: `slot-${weekday}`,
            weekday,
            start_minute: 540,
            duration_minutes: 120,
          })),
        },
        '2026-12-01',
        '2026-12-31',
      ),
    ).toBeNull()
    expect(
      contractJobError({ ...validJob(), frequency: 'weekly' }, '2026-12-01', '2026-12-31'),
    ).toBe('Marca al menos una franja en el calendario semanal.')
  })

  it.each([
    { anchor_on: '2026-11-30' },
    { anchor_on: '2027-01-01' },
    { frequency: 'monthly' as const, ends_on: '2026-11-30' },
    { frequency: 'monthly' as const, ends_on: '2027-01-01' },
  ])('keeps job dates inside the agreement: %j', (change) => {
    expect(contractJobError({ ...validJob(), ...change }, '2026-12-01', '2026-12-31')).toBeTruthy()
  })

  it('does not turn stale weekly form fields into one-off or monthly instructions', () => {
    const previous = {
      ...validJob(),
      weekdays: [3, 1, 3],
      weekly_slots: [3, 1].map((weekday) => ({
        id: `slot-${weekday}`,
        weekday,
        start_minute: 540,
        duration_minutes: 120,
      })),
      weekly_tasks: { 1: 'Suelos', 2: 'No incluido', 3: 'Mesas' },
      ends_on: '2026-12-20',
    }
    expect(normalizeContractJob(previous)).toMatchObject({
      weekdays: [],
      weekly_slots: [],
      weekly_tasks: {},
      ends_on: null,
    })
    expect(normalizeContractJob({ ...previous, frequency: 'monthly' })).toMatchObject({
      weekdays: [],
      weekly_tasks: {},
      ends_on: '2026-12-20',
    })
    expect(normalizeContractJob({ ...previous, frequency: 'weekly' })).toMatchObject({
      weekdays: [1, 3],
      local_start: '09:00',
      duration_minutes: 120,
      weekly_tasks: { 1: 'Suelos', 3: 'Mesas' },
    })
    expect(contractJobError({ ...previous, ends_on: '2026-11-01' }, '2026-12-01', null)).toBeNull()
  })

  it('requires an end date and a chosen team for recurring mobile work', () => {
    const job = { ...validJob(), frequency: 'monthly' as const }
    expect(contractJobError(job, '2026-12-01', null)).toContain('fin obligatoria')
    expect(contractJobError(job, '2026-12-01', '2026-12-31')).toContain('equipo')
    expect(
      contractJobError(
        { ...job, work_team_id: 'team', local_start: '09:00' },
        '2026-12-01',
        '2026-12-31',
      ),
    ).toBeNull()
  })

  it('accepts an optional time but rejects invalid durations and conflicting assignments', () => {
    expect(
      contractJobError({ ...validJob(), local_start: '25:00' }, '2026-12-01', null),
    ).toBeTruthy()
    expect(
      contractJobError({ ...validJob(), duration_minutes: 14 }, '2026-12-01', null),
    ).toBeTruthy()
    expect(
      contractJobError(
        { ...validJob(), assigned_user_id: 'person', work_team_id: 'team' },
        '2026-12-01',
        null,
      ),
    ).toBeTruthy()
  })
})
