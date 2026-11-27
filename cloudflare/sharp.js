// Worker-only adapter for the image operations used by the visit report.
import { env } from 'cloudflare:workers'

export default function sharp(bytes, options = {}) {
  let width
  let height
  let quality = 80
  let background = '#ffffff'
  const input = () => new Blob([bytes]).stream()
  const pipeline = {
    rotate() {
      return pipeline
    },
    resize(w, h) {
      width = w
      height = h
      return pipeline
    },
    flatten(config) {
      background = config.background
      return pipeline
    },
    jpeg(config) {
      quality = config.quality
      return pipeline
    },
    async toBuffer() {
      if (!env.IMAGES) throw new Error('Images binding not configured')
      const info = await env.IMAGES.info(input())
      if (!info.width || !info.height || info.width * info.height > options.limitInputPixels) {
        throw new Error('Invalid image dimensions')
      }
      const output = await env.IMAGES.input(input())
        .transform({ width, height, fit: 'scale-down', background })
        .output({ format: 'image/jpeg', quality })
      const response = output.response()
      if (!response.ok) throw new Error('Image transformation failed')
      return Buffer.from(await response.arrayBuffer())
    },
  }
  return pipeline
}
