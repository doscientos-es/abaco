const maxBodyBytes = 8_410_000
const maxPhotoBytes = 2_097_152
const maxPixels = 24_000_000
const maxOutputBytes = 256_000
const tokenPattern = /^[0-9a-f]{64}$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const b64Pattern = /^[A-Za-z0-9+/]+={0,2}$/
const protectedHeaders = {
  'Cache-Control': 'no-store, private',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Type': 'application/json',
}
class RequestFailure extends Error {
  constructor(status, key) {
    super(key)
    this.status = status
  }
}
function result(status, object) {
  return new Response(JSON.stringify(object), { status, headers: protectedHeaders })
}
const failure = (status, key) => new RequestFailure(status, key)

async function readBounded(request, max = maxBodyBytes) {
  const length = request.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > max))
    throw failure(413, 'body_too_large')
  if (!request.body) throw failure(400, 'invalid_input')
  const reader = request.body.getReader()
  const chunks = []
  let lengthRead = 0
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    void reader.cancel().catch(() => undefined)
  }, 45_000)
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (timedOut) throw failure(408, 'try_again')
      if (done) break
      lengthRead += value.byteLength
      if (lengthRead > max) {
        void reader.cancel().catch(() => undefined)
        throw failure(413, 'body_too_large')
      }
      chunks.push(value)
    }
  } finally {
    clearTimeout(timeout)
    reader.releaseLock()
  }
  const bytes = new Uint8Array(lengthRead)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function hash(value) {
  const bytes = new TextEncoder().encode(value)
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('')
}

function parsePayload(bytes) {
  let input
  try {
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw failure(400, 'invalid_input')
  }
  if (
    !input ||
    typeof input !== 'object' ||
    Object.keys(input).sort().join(',') !== 'address,availability,confirm,photos' ||
    input.confirm !== true ||
    !Array.isArray(input.photos) ||
    input.photos.length > 3
  )
    throw failure(400, 'invalid_input')
  function text(value, maximum) {
    if (typeof value !== 'string') throw failure(400, 'invalid_input')
    const safe = value.trim()
    const length = Array.from(safe).length
    if (
      length < 3 ||
      length > maximum ||
      Array.from(safe).some((character) => {
        const code = character.charCodeAt(0)
        return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127
      })
    )
      throw failure(400, 'invalid_input')
    return safe
  }
  const maxBase64 = 4 * Math.ceil(maxPhotoBytes / 3)
  if (
    input.photos.some(
      (photo) =>
        typeof photo !== 'string' ||
        !photo.length ||
        photo.length > maxBase64 ||
        photo.length % 4 !== 0 ||
        !b64Pattern.test(photo),
    )
  )
    throw failure(422, 'invalid_photo')
  return {
    address: text(input.address, 250),
    availability: text(input.availability, 400),
    photos: input.photos,
  }
}

const prefix = (bytes, values, offset = 0) =>
  values.every((value, i) => bytes[offset + i] === value)

function isSupported(bytes) {
  return (
    prefix(bytes, [255, 216, 255]) ||
    prefix(bytes, [137, 80, 78, 71, 13, 10, 26, 10]) ||
    (prefix(bytes, [82, 73, 70, 70]) && prefix(bytes, [87, 69, 66, 80], 8))
  )
}

/** Only freshly re-encoded JPEGs reach here; discard ancillary APPn and comment segments. */
export function stripJpegMetadata(bytes) {
  if (!prefix(bytes, [255, 216]) || !prefix(bytes, [255, 217], bytes.length - 2))
    throw failure(422, 'invalid_photo')
  const pieces = [bytes.subarray(0, 2)]
  let i = 2
  let scan = false
  let sawScan = false
  let entropy = 2
  let sawEnd = false
  while (i < bytes.length) {
    if (scan) {
      if (bytes[i] !== 255) {
        i++
        continue
      }
      const code = bytes[i + 1]
      if (code === 0 || (code >= 0xd0 && code <= 0xd7)) {
        i += 2
        continue
      }
      if (code === 255) {
        i++
        continue
      }
      pieces.push(bytes.subarray(entropy, i))
      scan = false
    }
    if (bytes[i] !== 255) throw failure(422, 'invalid_photo')
    const start = i
    while (bytes[i] === 255) i++
    const type = bytes[i++]
    if (type === 0xd9) {
      if (!sawScan || i !== bytes.length) throw failure(422, 'invalid_photo')
      pieces.push(bytes.subarray(start, i))
      sawEnd = true
      break
    }
    const length = bytes[i] * 256 + bytes[i + 1]
    if (!length || length < 2 || i + length > bytes.length) throw failure(422, 'invalid_photo')
    if (!((type >= 0xe0 && type <= 0xef) || type === 0xfe))
      pieces.push(bytes.subarray(start, i + length))
    i += length
    if (type === 0xda) {
      sawScan = true
      scan = true
      entropy = i
    }
  }
  if (!sawEnd) throw failure(422, 'invalid_photo')
  const result = new Uint8Array(pieces.reduce((sum, item) => sum + item.byteLength, 0))
  let offset = 0
  for (const piece of pieces) {
    result.set(piece, offset)
    offset += piece.byteLength
  }
  return result
}

function photoServiceFailure(code, status) {
  if (Number(code) === 9422 || status === 429) return failure(503, 'photo_quota')
  if ([9412, 9413, 9520].includes(Number(code))) return failure(422, 'invalid_photo')
  return failure(503, 'photo_unavailable')
}

function decodeIntakePhoto(encoded) {
  let bytes
  try {
    bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))
  } catch {
    throw failure(422, 'invalid_photo')
  }
  if (bytes.byteLength > maxPhotoBytes || !isSupported(bytes)) throw failure(422, 'invalid_photo')
  return bytes
}

export function sanitizeIntakePhoto(encoded, images) {
  if (!images) return Promise.reject(failure(503, 'photo_unavailable'))
  return Promise.resolve().then(() =>
    sanitizeDecodedIntakePhoto(decodeIntakePhoto(encoded), images),
  )
}

async function sanitizeDecodedIntakePhoto(bytes, images) {
  try {
    const input = () => new Blob([bytes]).stream()
    const info = await images.info(input())
    if (
      !info?.width ||
      !info?.height ||
      info.width * info.height > maxPixels ||
      Math.max(info.width, info.height) > 8000
    )
      throw failure(422, 'invalid_photo')
    const result = await images
      .input(input())
      .transform({ width: 1400, height: 1400, fit: 'scale-down', background: '#ffffff' })
      .output({ format: 'image/jpeg', quality: 76, anim: false })
    const response = result.response()
    if (!response.ok || response.headers.get('content-type') !== 'image/jpeg')
      throw photoServiceFailure(
        /\berr=(\d{4})\b/.exec(response.headers.get('cf-resized') ?? '')?.[1],
        response.status,
      )
    let stripped
    try {
      stripped = stripJpegMetadata(await readBounded(response, 600_000))
    } catch (err) {
      if (err instanceof RequestFailure && err.status === 413) throw failure(422, 'invalid_photo')
      // At this point the processor, not the visitor, produced invalid or truncated JPEG output.
      throw failure(503, 'photo_unavailable')
    }
    if (stripped.byteLength > maxOutputBytes) throw failure(422, 'invalid_photo')
    const chunks = []
    for (let offset = 0; offset < stripped.length; offset += 8192)
      chunks.push(String.fromCharCode(...stripped.subarray(offset, offset + 8192)))
    return btoa(chunks.join(''))
  } catch (err) {
    if (err instanceof RequestFailure) throw err
    throw photoServiceFailure(err?.code, err?.status)
  }
}

export async function handleInterventionRequest(request, { appOrigin, rpc, images, allowRequest }) {
  if (request.method !== 'POST') return result(405, { error: 'method_not_allowed' })
  if (
    !appOrigin ||
    request.headers.get('origin') !== appOrigin ||
    (request.headers.has('sec-fetch-site') &&
      request.headers.get('sec-fetch-site') !== 'same-origin')
  )
    return result(403, { error: 'forbidden' })
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json')
    return result(415, { error: 'invalid_input' })
  const path = new URL(request.url).pathname
  if (path !== '/api/intervention-request/check' && path !== '/api/intervention-request/submit')
    return result(404, { error: 'unavailable_link' })
  const token = request.headers.get('x-request-invitation') ?? ''
  if (!tokenPattern.test(token)) return result(404, { error: 'unavailable_link' })
  const submitting = path.endsWith('/submit')
  const op = submitting ? request.headers.get('x-request-operation') : null
  const mode = submitting ? request.headers.get('x-request-photo-mode') : null
  if (submitting && (!op || !uuidPattern.test(op) || !['photos', 'text'].includes(mode)))
    return result(400, { error: 'invalid_input' })
  try {
    if (!allowRequest) return result(503, { error: 'try_again' })
    if (!(await allowRequest(request))) return result(429, { error: 'try_later' })
    const lookup = await hash(token)
    const gate = await rpc('guard_intervention_intake', {
      p_token_hash: lookup,
      p_op: op,
      p_with_photos: mode === null ? null : mode === 'photos',
    })
    if (!gate) return result(404, { error: 'unavailable_link' })
    if (gate.state === 'photo_limited') return result(429, { error: 'photo_attempt_limit' })
    if (gate.state === 'limited') return result(429, { error: 'try_later' })
    if (!submitting) return result(200, { available: true })
    const body = parsePayload(await readBounded(request, mode === 'text' ? 4096 : maxBodyBytes))
    if (body.photos.length > 0 !== (mode === 'photos'))
      return result(400, { error: 'invalid_input' })
    const digest = await hash(JSON.stringify(body))
    if (gate.state === 'replay')
      return digest === gate.digest
        ? result(200, { receipt: gate.receipt })
        : result(404, { error: 'unavailable_link' })
    if (gate.state !== 'pending') return result(404, { error: 'unavailable_link' })
    const sanitized = []
    if (body.photos.length) {
      if (!images) return result(503, { error: 'photo_unavailable' })
      if (!Number.isInteger(gate.photo_attempt)) return result(503, { error: 'photo_unavailable' })
      const files = body.photos.map(decodeIntakePhoto)
      let reserved
      try {
        reserved = await rpc('claim_intervention_image_budget', {
          p_token_hash: lookup,
          p_op: op,
          p_attempt: gate.photo_attempt,
          p_count: files.length,
        })
      } catch {
        return result(503, { error: 'photo_unavailable' })
      }
      if (reserved === false) return result(503, { error: 'photo_quota' })
      if (reserved !== true) return result(404, { error: 'unavailable_link' })
      for (const file of files) sanitized.push(await sanitizeDecodedIntakePhoto(file, images))
    }
    const receipt = await rpc('submit_intervention_intake', {
      p_token_hash: lookup,
      p_op: op,
      p_digest: digest,
      p_address: body.address,
      p_availability: body.availability,
      p_photos: sanitized,
    })
    return receipt ? result(200, { receipt }) : result(404, { error: 'unavailable_link' })
  } catch (err) {
    return err instanceof RequestFailure
      ? result(err.status, { error: err.message })
      : result(503, { error: 'try_again' })
  }
}
