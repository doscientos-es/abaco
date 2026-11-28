import type { StaffArrivalDraft } from '../infrastructure/staff-arrival-repository'
export {
  loadStaffArrival,
  saveStaffArrival,
  type StaffArrivalDraft,
} from '../infrastructure/staff-arrival-repository'

export const emptyStaffArrival: StaffArrivalDraft = {
  instructions: '',
  parking: '',
  contact_label: '',
  contact_phone: '',
  share_directions: false,
  share_contact: false,
}

export function normalizeStaffArrival(draft: StaffArrivalDraft) {
  const cleaned = {
    ...draft,
    instructions: draft.instructions.trim(),
    parking: draft.parking.trim(),
    contact_label: draft.contact_label.trim(),
    contact_phone: draft.contact_phone.trim().replace(/[()\s.-]/g, ''),
  }
  const formatError =
    cleaned.contact_phone && !/^\+[1-9][0-9]{6,14}$/.test(cleaned.contact_phone)
      ? 'Escribe un número de trabajo con prefijo internacional, por ejemplo +34600000000.'
      : ''
  const directionsError =
    cleaned.share_directions && !cleaned.instructions && !cleaned.parking
      ? 'Añade una indicación de entrada o de aparcamiento antes de compartir.'
      : ''
  const contactError =
    cleaned.share_contact && !cleaned.contact_phone
      ? 'Añade el teléfono operativo antes de compartirlo.'
      : ''
  return { cleaned, error: formatError || directionsError || contactError }
}
