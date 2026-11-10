/** Remove data cached by the retired pool module when signing out. */
export function clearLegacyMeasurementQueues() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index)
      if (key?.startsWith('abaco:measurement-queue:v1:')) localStorage.removeItem(key)
    }
  } catch {
    // Storage can be unavailable in private browsing.
  }
}
