import { afterEach, expect, it, vi } from 'vitest'

import { prepareChatAudio, prepareChatImage } from './prepare-chat-attachment'

afterEach(() => vi.unstubAllGlobals())

it('resizes an image and re-encodes it as JPEG without the original metadata', async () => {
  const close = vi.fn()
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 2048, height: 1024, close })),
  )
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ fillStyle: '', fillRect() {}, drawImage() {} }),
    toBlob: (callback: (blob: Blob) => void) =>
      callback(new Blob(['jpeg'], { type: 'image/jpeg' })),
  }
  vi.stubGlobal('document', { createElement: () => canvas })
  const result = await prepareChatImage(new File(['original'], 'photo.png', { type: 'image/png' }))
  expect([canvas.width, canvas.height]).toEqual([512, 256])
  expect(result.type).toBe('image/jpeg')
  expect(result.size).toBe(4)
  expect(close).toHaveBeenCalledOnce()
})

it('rejects unsupported or oversized images before decoding', async () => {
  const decode = vi.fn()
  vi.stubGlobal('createImageBitmap', decode)
  await expect(
    prepareChatImage(new File(['x'], 'fake.svg', { type: 'image/svg+xml' })),
  ).rejects.toThrow('JPG')
  await expect(
    prepareChatImage(new File([new Uint8Array(10_000_001)], 'big.jpg', { type: 'image/jpeg' })),
  ).rejects.toThrow('10 MB')
  expect(decode).not.toHaveBeenCalled()
})

it('converts audio to bounded mono PCM WAV and releases the decoder', async () => {
  const close = vi.fn(async () => {})
  vi.stubGlobal(
    'AudioContext',
    class {
      decodeAudioData = async () => ({ duration: 1 })
      close = close
    },
  )
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      destination = {}
      createBufferSource() {
        return { buffer: null, connect() {}, start() {} }
      }
      async startRendering() {
        return { getChannelData: () => new Float32Array(16_000) }
      }
    },
  )
  const result = await prepareChatAudio(new Blob(['audio']))
  const view = new DataView(await result.arrayBuffer())
  expect(result.type).toBe('audio/wav')
  expect(result.size).toBe(32_044)
  expect(view.getUint32(24, true)).toBe(16_000)
  expect(view.getUint16(22, true)).toBe(1)
  expect(close).toHaveBeenCalledOnce()
})

it('rejects recordings over 15 seconds before resampling and closes the decoder', async () => {
  const close = vi.fn(async () => {})
  vi.stubGlobal(
    'AudioContext',
    class {
      decodeAudioData = async () => ({ duration: 15.1 })
      close = close
    },
  )
  await expect(prepareChatAudio(new Blob(['audio']))).rejects.toThrow('15 segundos')
  expect(close).toHaveBeenCalledOnce()
})

it('rejects oversized audio before decoding', async () => {
  const Audio = vi.fn()
  vi.stubGlobal('AudioContext', Audio)
  await expect(prepareChatAudio(new Blob([new Uint8Array(2_000_001)]))).rejects.toThrow('tamaño')
  expect(Audio).not.toHaveBeenCalled()
})
