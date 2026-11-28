import { describe, expect, it } from 'vitest'

import { initialPractice, PRACTICE_NOTE_LIMIT, practiceReducer } from './technician-practice'

const inspected = practiceReducer(initialPractice, { type: 'choose', visitId: 'climatizacion' })
const draft = practiceReducer(inspected, { type: 'draft' })

describe('technician practice', () => {
  it('requires selecting and inspecting a fictitious visit before starting', () => {
    expect(practiceReducer(initialPractice, { type: 'draft' })).toEqual(initialPractice)
    expect(practiceReducer(inspected, { type: 'simulate' })).toEqual(inspected)
    expect(draft).toEqual({
      step: 'draft',
      visitId: 'climatizacion',
      checked: [false, false],
      error: null,
      note: '',
    })
  })

  it('requires both checklist items and a non-blank note', () => {
    const noted = practiceReducer(draft, { type: 'note', value: 'Nota' })
    expect(practiceReducer(noted, { type: 'simulate' })).toMatchObject({
      step: 'draft',
      error: expect.any(String),
    })

    const first = practiceReducer(draft, { type: 'check', index: 0, checked: true })
    const both = practiceReducer(first, { type: 'check', index: 1, checked: true })
    const blank = practiceReducer(both, { type: 'note', value: '  ' })
    expect(practiceReducer(blank, { type: 'simulate' })).toMatchObject({
      step: 'draft',
      error: expect.any(String),
    })
  })

  it('trims the result, caps notes, and discards the report when starting another exercise', () => {
    const first = practiceReducer(draft, { type: 'check', index: 0, checked: true })
    const both = practiceReducer(first, { type: 'check', index: 1, checked: true })
    const long = practiceReducer(both, { type: 'note', value: 'x'.repeat(PRACTICE_NOTE_LIMIT + 3) })
    expect(long).toMatchObject({ note: 'x'.repeat(PRACTICE_NOTE_LIMIT) })
    const filled = practiceReducer(both, { type: 'note', value: '  Equipo revisado. ' })
    const result = practiceReducer(filled, { type: 'simulate' })
    expect(result).toEqual({
      step: 'result',
      visitId: 'climatizacion',
      checked: [true, true],
      note: 'Equipo revisado.',
    })

    const reset = practiceReducer(result, { type: 'reset' })
    const another = practiceReducer(reset, { type: 'choose', visitId: 'iluminacion' })
    expect(practiceReducer(another, { type: 'draft' })).toEqual({
      step: 'draft',
      visitId: 'iluminacion',
      checked: [false, false],
      error: null,
      note: '',
    })
  })
})
