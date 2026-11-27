import {
  chatAudioSampleRate,
  maxChatAudioSeconds,
  maxChatImageBytes,
  maxChatImageDimension,
} from '../domain/chat-attachment-limits'

export async function prepareChatImage(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10_000_000)
    throw new Error('Usa imágenes JPG, PNG o WebP de hasta 10 MB.')
  const image = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxChatImageDimension / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No se pudo preparar la imagen.')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.8, 0.6, 0.4, 0.25]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      )
      if (blob && blob.type === 'image/jpeg' && blob.size <= maxChatImageBytes)
        return new File([blob], 'imagen.jpg', { type: 'image/jpeg' })
    }
    throw new Error('No se pudo reducir la imagen. Prueba con otra.')
  } finally {
    image.close()
  }
}

export async function prepareChatAudio(file: Blob): Promise<File> {
  if (!file.size || file.size > 2_000_000) throw new Error('El audio supera el tamaño permitido.')
  const context = new AudioContext()
  try {
    const input = await context.decodeAudioData(await file.arrayBuffer())
    if (!input.duration || input.duration > maxChatAudioSeconds)
      throw new Error(`El audio debe durar como máximo ${maxChatAudioSeconds} segundos.`)
    const length = Math.ceil(input.duration * chatAudioSampleRate)
    const offline = new OfflineAudioContext(1, length, chatAudioSampleRate)
    const source = offline.createBufferSource()
    source.buffer = input
    source.connect(offline.destination)
    source.start()
    const samples = (await offline.startRendering()).getChannelData(0)
    const buffer = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(buffer)
    const write = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
    }
    write(0, 'RIFF')
    view.setUint32(4, buffer.byteLength - 8, true)
    write(8, 'WAVEfmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, chatAudioSampleRate, true)
    view.setUint32(28, chatAudioSampleRate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    write(36, 'data')
    view.setUint32(40, samples.length * 2, true)
    samples.forEach((sample, index) => {
      const value = Math.max(-1, Math.min(1, sample))
      view.setInt16(44 + index * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true)
    })
    return new File([buffer], 'audio.wav', { type: 'audio/wav' })
  } finally {
    await context.close()
  }
}
