import type { IncomingMessage, ServerResponse } from 'node:http'

export function reply(response: ServerResponse, status: number, body: object) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.end(JSON.stringify(body))
}

export async function readJson(request: IncomingMessage, limit: number): Promise<unknown> {
  const declared = Number(request.headers['content-length'] ?? 0)
  if (!Number.isFinite(declared) || declared < 0 || declared > limit)
    throw new Error('Invalid request')
  const parts: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    size += data.length
    if (size > limit) throw new Error('Invalid request')
    parts.push(data)
  }
  if (!size) throw new Error('Invalid request')
  return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown
}
