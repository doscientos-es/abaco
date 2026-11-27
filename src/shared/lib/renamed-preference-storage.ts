/** Read old browser preferences without overwriting settings already saved under the new name. */
export function readRenamedPreference(storage: Storage, key: string): string | null {
  const current = storage.getItem(key)
  if (current != null || !key.startsWith('menoslios:')) return current ?? null

  const legacy = storage.getItem(`abaco:${key.slice('menoslios:'.length)}`)
  if (legacy == null) return null
  try {
    storage.setItem(key, legacy)
  } catch {
    // The old value remains usable even when storage is read-only or full.
  }
  return legacy
}
