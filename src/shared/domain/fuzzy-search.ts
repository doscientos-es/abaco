/** Normalize Spanish text before comparing it, ignoring accents, punctuation and case. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function distanceAtMostOne(left: string, right: string): boolean {
  if (left === right) return true
  if (Math.abs(left.length - right.length) > 1) return false

  let i = 0
  let j = 0
  let edits = 0
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1
      j += 1
      continue
    }
    edits += 1
    if (edits > 1) return false
    if (left.length > right.length) i += 1
    else if (right.length > left.length) j += 1
    else {
      i += 1
      j += 1
    }
  }
  return edits + Number(i < left.length || j < right.length) <= 1
}

/** Every query word must match a word or prefix in the record; one typo per word is tolerated. */
export function fuzzySearch(query: string, ...values: string[]): boolean {
  const queryWords = normalizeSearchText(query).split(/\s+/).filter(Boolean)
  if (queryWords.length === 0) return true

  const text = normalizeSearchText(values.join(' '))
  if (text.includes(normalizeSearchText(query))) return true
  const words = text.split(/\s+/)
  return queryWords.every((queryWord) =>
    words.some((word) => {
      if (word.startsWith(queryWord)) return true
      if (queryWord.length < 4) return false
      const candidate = word.slice(0, Math.min(word.length, queryWord.length + 1))
      return distanceAtMostOne(queryWord, candidate)
    }),
  )
}
