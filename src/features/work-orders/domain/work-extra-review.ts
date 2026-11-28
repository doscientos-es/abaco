export type WorkExtraAmounts = { net: number; vat: number; gross: number }

export function workExtraAmounts(net: number, rate: number): WorkExtraAmounts | null {
  const rateBasis = Math.round(rate * 100)
  if (
    !Number.isSafeInteger(net) ||
    net < 0 ||
    !Number.isFinite(rate) ||
    rate < 0 ||
    rate > 100 ||
    Math.abs(rateBasis / 100 - rate) > Number.EPSILON
  ) {
    return null
  }
  const vat = Number((BigInt(net) * BigInt(rateBasis) + 5000n) / 10000n)
  const gross = net + vat
  return Number.isSafeInteger(gross) ? { net, vat, gross } : null
}

export function workExtraReviewKey(id: string, total: WorkExtraAmounts | null): string | null {
  return total ? `${id}:${total.net}:${total.gross}` : null
}

export const reviewedWorkExtra = (reviewed: string | null, current: string | null) =>
  current !== null && reviewed === current
