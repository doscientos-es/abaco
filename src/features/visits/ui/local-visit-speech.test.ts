import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  currentBrowserRecognition,
  localSpanishAvailability,
  recognizerIfLocal,
  type LocalRecognitionClass,
} from './local-visit-speech'

const browserClass = (mock: unknown) => mock as LocalRecognitionClass

afterEach(() => vi.unstubAllGlobals())

describe('on-device recognizer policy', () => {
  it('does not select a legacy prefixed or insecure recognizer', () => {
    vi.stubGlobal('window', {
      isSecureContext: true,
      webkitSpeechRecognition: class {
        static available = vi.fn()
      },
    })
    expect(currentBrowserRecognition()).toBeUndefined()
    vi.stubGlobal('window', {
      isSecureContext: false,
      SpeechRecognition: class {
        static available = vi.fn()
      },
    })
    expect(currentBrowserRecognition()).toBeUndefined()
  })

  it('rejects implementations that would merely accept an arbitrary JS property', () => {
    const start = vi.fn()
    const RemoteOnly = class {
      start = start
    }
    expect(recognizerIfLocal(browserClass(RemoteOnly))).toBeNull()
    expect(start).not.toHaveBeenCalled()
  })

  it('checks Spain Spanish and forces local processing without opening the mic', async () => {
    const available = vi.fn().mockResolvedValue('available')
    const start = vi.fn()
    const Standard = class {
      static available = available
      processLocally = false
      start = start
    }
    vi.stubGlobal('window', { isSecureContext: true, SpeechRecognition: Standard })
    const recognitionClass = currentBrowserRecognition()
    expect(recognitionClass).toBe(Standard)
    if (!recognitionClass) throw new Error('Expected a local recognizer class')
    expect(await localSpanishAvailability(recognitionClass)).toBe('available')
    expect(available).toHaveBeenCalledWith({ langs: ['es-ES'], processLocally: true })
    expect(recognizerIfLocal(recognitionClass)?.processLocally).toBe(true)
    expect(start).not.toHaveBeenCalled()
  })
})
