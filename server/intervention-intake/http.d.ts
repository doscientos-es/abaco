interface ImageInspection {
  width?: number
  height?: number
}
interface ImageBinding {
  info(input: ReadableStream<Uint8Array>): Promise<ImageInspection>
  input(input: ReadableStream<Uint8Array>): {
    transform(options: Record<string, unknown>): {
      output(options: Record<string, unknown>): Promise<{ response(): Response }>
    }
  }
}
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array
export function sanitizeIntakePhoto(encoded: string, images?: ImageBinding): Promise<string>
export function handleInterventionRequest(
  request: Request,
  dependencies: {
    appOrigin: string | undefined
    allowRequest?: (request: Request) => Promise<boolean>
    rpc(name: string, params: Record<string, unknown>): Promise<unknown>
    images: ImageBinding | undefined
  },
): Promise<Response>
