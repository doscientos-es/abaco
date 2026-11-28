export const visitDictationLanguage = 'es-ES'

type SpeechResults = {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

export type LocalRecognition = {
  lang: string
  processLocally: boolean
  continuous: boolean
  interimResults: boolean
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  onresult: ((event: SpeechResults) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

export type LocalRecognitionClass = {
  new (): LocalRecognition
  available?: (options: { langs: string[]; processLocally: true }) => Promise<string>
}

export function recognizerIfLocal(Recognition: LocalRecognitionClass) {
  const instance = new Recognition()
  // An unsupported JS implementation accepts new expando fields. Probe before assigning.
  if (!('processLocally' in instance)) return null
  instance.processLocally = true
  return instance.processLocally === true ? instance : null
}

export function currentBrowserRecognition() {
  if (!window.isSecureContext) return undefined
  const Recognition = (window as unknown as { SpeechRecognition?: LocalRecognitionClass })
    .SpeechRecognition
  return typeof Recognition?.available === 'function' ? Recognition : undefined
}

export async function localSpanishAvailability(Recognition: LocalRecognitionClass) {
  if (!Recognition.available) return 'unavailable'
  return await Recognition.available({ langs: [visitDictationLanguage], processLocally: true })
}
