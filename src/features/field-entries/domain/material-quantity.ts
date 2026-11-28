export const maxMaterialQuantity = 999999999.999

export function readMaterialQuantity(input: string) {
  // Decimal comma is useful for the Spanish numeric keyboard without requiring
  // native number inputs to infer the operator's locale.
  const trimmed = input.trim()
  if (!/^\d{1,9}(?:[.,]\d{1,3})?$/.test(trimmed)) return null
  const quantity = Number(trimmed.replace(',', '.'))
  return quantity > 0 && quantity <= maxMaterialQuantity ? quantity : null
}

export function moveMaterialQuantity(input: string, direction: -1 | 1) {
  const current = readMaterialQuantity(input)
  if (current === null) return direction === 1 ? '1' : input
  const next = Math.round(current * 1000) + direction * 1000
  return next > 0 && next <= maxMaterialQuantity * 1000 ? String(next / 1000) : input
}

export function isMaterialKind(kind: string): kind is 'material' | 'spare' | 'product' {
  return kind === 'material' || kind === 'spare' || kind === 'product'
}
