export const PDF_BUCKET = 'visit-report-pdfs'
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024
export const MAX_PDF_BYTES = 20 * 1024 * 1024
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class UpstreamError extends Error {
  constructor(public readonly status: number = 502) {
    super('Upstream unavailable')
  }
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export class SupabaseReportStore {
  readonly base: string

  constructor(
    base: string,
    private readonly key: string,
  ) {
    this.base = base.replace(/\/$/, '')
  }

  async request(
    path: string,
    options: { method?: string; body?: Buffer | string; type?: string; limit?: number } = {},
  ) {
    const headers: Record<string, string> = {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
    }
    if (options.type) headers['Content-Type'] = options.type
    if (options.type === 'application/pdf') headers['x-upsert'] = 'false'
    const url = new URL(path, this.base)
    if (url.origin !== new URL(this.base).origin) throw new UpstreamError()
    let response: Response
    try {
      response = await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        ...(options.body === undefined ? {} : { body: options.body as BodyInit }),
        redirect: 'error',
        signal: AbortSignal.timeout(25_000),
      })
    } catch {
      throw new UpstreamError()
    }
    if (!response.ok) {
      await response.body?.cancel()
      return { status: response.status, data: Buffer.alloc(0) }
    }
    const limit = options.limit ?? 11 * 1024 * 1024
    const parts: Buffer[] = []
    let size = 0
    if (response.body && options.method !== 'HEAD') {
      const reader = response.body.getReader()
      try {
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) break
          size += chunk.value.byteLength
          if (size > limit) throw new UpstreamError()
          parts.push(Buffer.from(chunk.value))
        }
      } catch {
        throw new UpstreamError()
      } finally {
        await reader.cancel().catch(() => undefined)
      }
    }
    return { status: response.status, data: Buffer.concat(parts) }
  }

  async json(path: string, body?: object) {
    const result = await this.request(
      path,
      body === undefined
        ? {}
        : {
            method: 'POST',
            body: JSON.stringify(body),
            type: 'application/json',
          },
    )
    let data: unknown = null
    if (result.data.length) {
      try {
        data = JSON.parse(result.data.toString('utf8')) as unknown
      } catch {
        throw new UpstreamError()
      }
    }
    return { status: result.status, data }
  }

  async one(path: string): Promise<Record<string, unknown> | null> {
    const result = await this.json(path)
    if (result.status !== 200 || !Array.isArray(result.data)) throw new UpstreamError()
    return result.data.length ? record(result.data[0]) : null
  }

  async rpc(name: string, body: object): Promise<unknown> {
    const result = await this.json(`/rest/v1/rpc/${name}`, body)
    if (result.status !== 200) throw new UpstreamError()
    return result.data
  }

  objectPath(tenant: string, version: string) {
    if (!UUID.test(tenant) || !UUID.test(version)) throw new Error('Invalid report identifiers')
    return `${tenant}/${version}.pdf`
  }

  async exists(path: string) {
    const { status } = await this.request(`/storage/v1/object/info/${PDF_BUCKET}/${path}`, {
      method: 'HEAD',
      limit: 0,
    })
    if (status !== 200 && status !== 404) throw new UpstreamError()
    return status === 200
  }

  async upload(path: string, pdf: Buffer) {
    if (pdf.length > MAX_PDF_BYTES) throw new Error('PDF exceeds bucket limit')
    const { status } = await this.request(`/storage/v1/object/${PDF_BUCKET}/${path}`, {
      method: 'POST',
      body: pdf,
      type: 'application/pdf',
      limit: 4096,
    })
    if (![200, 201, 409].includes(status)) throw new UpstreamError()
  }
}
