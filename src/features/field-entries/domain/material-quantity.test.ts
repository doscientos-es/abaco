import { describe, expect, it } from 'vitest'

import { moveMaterialQuantity, readMaterialQuantity } from './material-quantity'

describe('material quantities', () => {
  it('accepts comma or point, with up to three decimals', () => {
    expect(readMaterialQuantity(' 4,625 ')).toBe(4.625)
    expect(readMaterialQuantity('12.125')).toBe(12.125)
    expect(readMaterialQuantity('999999999.999')).toBe(999999999.999)
  })

  it('rejects zero, negative, scientific notation, grouping and too much precision', () => {
    for (const input of ['0', '-1', '1e4', '1,000.5', '1.1234', '1000000000', '', '1.'])
      expect(readMaterialQuantity(input)).toBeNull()
  })

  it('steps one whole unit without floating-point drift or invalid amounts', () => {
    expect(moveMaterialQuantity('2,3', 1)).toBe('3.3')
    expect(moveMaterialQuantity('2.005', -1)).toBe('1.005')
    expect(moveMaterialQuantity('1', -1)).toBe('1')
    expect(moveMaterialQuantity('0.5', -1)).toBe('0.5')
    expect(moveMaterialQuantity('999999999.999', 1)).toBe('999999999.999')
    expect(moveMaterialQuantity('', 1)).toBe('1')
  })
})
