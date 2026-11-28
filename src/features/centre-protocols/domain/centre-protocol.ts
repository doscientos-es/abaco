export const maxProtocolRows = 6
export const maxProtocolItemLength = 160

export type OfficeCentreProtocol = { revision: number; items: string[]; shared: boolean }
type ProtocolChange = 'no_baseline' | 'new' | 'unchanged' | 'changed'

export type AssignedCentreProtocol = {
  visit_id: string
  revision: number
  items: string[]
  state: ProtocolChange
  changed_items: string[]
  removed_count: number
}

export function protocolItems(rows: string[]) {
  return rows.map((value) => value.trim()).filter(Boolean)
}

function containsControl(text: string) {
  return Array.from(text).some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || (code >= 127 && code <= 159)
  })
}

export function protocolValidation(items: string[], shared: boolean) {
  if (
    items.length > maxProtocolRows ||
    items.some((item) => item.length > maxProtocolItemLength || containsControl(item))
  )
    return 'Escribe hasta seis indicaciones de una línea (160 caracteres cada una).'
  if (new Set(items).size !== items.length) return 'Evita repetir indicaciones.'
  if (shared && !items.length) return 'Añade una indicación antes de compartir.'
  return null
}
