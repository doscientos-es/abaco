import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'

export const bookingReferenceField = 'abaco_reference'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validCalSignature(body: string, signature: string, secret: string): boolean {
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature)) return false
  const digest = createHmac('sha256', secret).update(body).digest()
  return timingSafeEqual(digest, Buffer.from(signature, 'hex'))
}

function record(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {}
}

/** A redirect or the client-side “booked” callback is not proof of booking. */
export function bookingConfirmation(raw: unknown, eventTypeId: string) {
  const event = record(raw)
  if (event.triggerEvent !== 'BOOKING_CREATED') return null
  const booking = record(event.payload)
  const id = booking.eventTypeId ?? record(booking.eventType).id
  if (String(id) !== eventTypeId || booking.status !== 'ACCEPTED') return null
  const response = record(booking.responses)[bookingReferenceField]
  const reference = typeof response === 'string' ? response : record(response).value
  if (
    typeof reference !== 'string' ||
    !uuid.test(reference) ||
    typeof booking.uid !== 'string' ||
    !booking.uid ||
    booking.uid.length > 160 ||
    typeof booking.startTime !== 'string' ||
    !Number.isFinite(Date.parse(booking.startTime)) ||
    !Array.isArray(booking.attendees)
  )
    return null

  const emails = booking.attendees
    .slice(0, 20)
    .map((entry: unknown) => record(entry).email)
    .filter((email: unknown): email is string => typeof email === 'string' && email.length <= 254)
    .map((email) => email.trim().toLowerCase())
  if (!emails.length) return null
  return {
    p_reference: reference,
    p_booking_uid: booking.uid,
    p_appointment_at: new Date(booking.startTime).toISOString(),
    p_attendee_emails: emails,
  }
}
