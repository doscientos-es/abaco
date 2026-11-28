import { describe, expect, it } from 'vitest'

import { parseMeasurementValue } from './measurement-value'

describe('typed measurement input', () => {
  it.each([
    ['0', 0],
    [' -2,5 ', -2.5],
    ['7.125', 7.125],
    ['100000', 100000],
  ])('parses %s', (input, expected) => {
    expect(parseMeasurementValue(input)).toBe(expected)
  })
  it.each([
    '',
    ' ',
    'NaN',
    'Infinity',
    '1.2.3',
    '1.234,56',
    '7.0001',
    '1e4',
    '100001',
    '0x11',
    '--1',
  ])('rejects %s', (input) => {
    expect(parseMeasurementValue(input)).toBeNull()
  })
})
