import type { UIMessage } from 'ai'
import sharp from 'sharp'

import {
  chatAudioSampleRate,
  maxChatAudioBytes,
  maxChatImageBytes,
  maxChatImageDimension,
  maxChatImages,
} from '../../src/features/ai/domain/chat-attachment-limits.js'

function decodeDataUrl(url: string, mediaType: string, maxBytes: number): Buffer {
  const prefix = `data:${mediaType};base64,`
  if (!url.startsWith(prefix)) throw new Error('invalid attachment')
  const encoded = url.slice(prefix.length)
  if (
    !encoded ||
    encoded.length > Math.ceil(maxBytes / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
  )
    throw new Error('invalid attachment')
  const data = Buffer.from(encoded, 'base64')
  if (!data.length || data.length > maxBytes || data.toString('base64') !== encoded)
    throw new Error('invalid attachment')
  return data
}

function validateAudio(data: Buffer) {
  if (
    data.length <= 44 ||
    data.toString('ascii', 0, 4) !== 'RIFF' ||
    data.readUInt32LE(4) !== data.length - 8 ||
    data.toString('ascii', 8, 16) !== 'WAVEfmt ' ||
    data.readUInt32LE(16) !== 16 ||
    data.readUInt16LE(20) !== 1 ||
    data.readUInt16LE(22) !== 1 ||
    data.readUInt32LE(24) !== chatAudioSampleRate ||
    data.readUInt32LE(28) !== chatAudioSampleRate * 2 ||
    data.readUInt16LE(32) !== 2 ||
    data.readUInt16LE(34) !== 16 ||
    data.toString('ascii', 36, 40) !== 'data' ||
    data.readUInt32LE(40) !== data.length - 44 ||
    (data.length - 44) % 2 !== 0
  )
    throw new Error('invalid audio')
}

/** Only the latest user turn may carry bounded, inline files. */
export async function validateChatAttachments(messages: UIMessage[], audioAllowed: boolean) {
  const lastUser =
    messages.length - 1 - [...messages].reverse().findIndex((message) => message.role === 'user')
  let images = 0
  let audio = 0
  for (const [index, message] of messages.entries()) {
    for (const part of message.parts) {
      if (part.type !== 'file') continue
      if (message.role !== 'user' || index !== lastUser || (part.filename?.length ?? 0) > 120)
        throw new Error('invalid attachment')
      if (part.mediaType === 'image/jpeg') {
        if (++images > maxChatImages) throw new Error('too many images')
        const data = decodeDataUrl(part.url, part.mediaType, maxChatImageBytes)
        const info = await sharp(data, { limitInputPixels: maxChatImageDimension ** 2 }).metadata()
        if (
          info.format !== 'jpeg' ||
          !info.width ||
          !info.height ||
          info.width > maxChatImageDimension ||
          info.height > maxChatImageDimension
        )
          throw new Error('invalid image')
        await sharp(data, { limitInputPixels: maxChatImageDimension ** 2 })
          .raw()
          .toBuffer()
      } else if (part.mediaType === 'audio/wav' && audioAllowed) {
        if (++audio > 1) throw new Error('too many audio files')
        validateAudio(decodeDataUrl(part.url, part.mediaType, maxChatAudioBytes))
      } else throw new Error('unsupported attachment')
    }
  }
}
