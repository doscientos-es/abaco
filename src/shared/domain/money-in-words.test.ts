import { describe, expect, it } from 'vitest'

import { eurosInWords } from './money-in-words'

describe('Spanish monetary wording', () => {
  it.each([
    [21_632, 'DOSCIENTOS DIECISÉIS EUROS CON TREINTA Y DOS CÉNTIMOS'],
    [0, 'CERO EUROS'],
    [1, 'CERO EUROS CON UN CÉNTIMO'],
    [100, 'UN EURO'],
    [101, 'UN EURO CON UN CÉNTIMO'],
    [2121, 'VEINTIÚN EUROS CON VEINTIÚN CÉNTIMOS'],
    [3131, 'TREINTA Y UN EUROS CON TREINTA Y UN CÉNTIMOS'],
    [10_000, 'CIEN EUROS'],
    [10_126, 'CIENTO UN EUROS CON VEINTISÉIS CÉNTIMOS'],
    [50_000, 'QUINIENTOS EUROS'],
    [70_000, 'SETECIENTOS EUROS'],
    [90_000, 'NOVECIENTOS EUROS'],
    [100_000, 'MIL EUROS'],
    [2_100_000, 'VEINTIÚN MIL EUROS'],
    [100_000_000, 'UN MILLÓN DE EUROS'],
    [200_000_001, 'DOS MILLONES DE EUROS CON UN CÉNTIMO'],
    [100_000_100, 'UN MILLÓN UN EUROS'],
    [100_000_000_000, 'MIL MILLONES DE EUROS'],
    [100_000_000_000_000, 'UN BILLÓN DE EUROS'],
  ])('writes %i cents as %s', (cents, words) => {
    expect(eurosInWords(cents)).toBe(words)
  })

  it.each([-1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid cents: %s',
    (value) => {
      expect(() => eurosInWords(value)).toThrow(RangeError)
    },
  )
})
