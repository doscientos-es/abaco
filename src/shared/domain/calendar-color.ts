export const calendarColors = [
  { id: 'forest', label: 'Verde', swatch: '#39754a', background: '#e0f0e3' },
  { id: 'blue', label: 'Azul', swatch: '#2867a4', background: '#dcecf9' },
  { id: 'violet', label: 'Violeta', swatch: '#7951a7', background: '#eee3f8' },
  { id: 'rose', label: 'Rosa', swatch: '#a54869', background: '#f8e2e9' },
  { id: 'amber', label: 'Ámbar', swatch: '#946313', background: '#f8edd4' },
  { id: 'teal', label: 'Turquesa', swatch: '#21766f', background: '#d9f0ed' },
  { id: 'indigo', label: 'Índigo', swatch: '#4b5fa9', background: '#e3e9fa' },
  { id: 'coral', label: 'Coral', swatch: '#a65a3b', background: '#f8e6dc' },
] as const

export type CalendarColor = (typeof calendarColors)[number]['id']

export function resolveCalendarColor(userId: string, value?: string | null): CalendarColor {
  if (calendarColors.some((color) => color.id === value)) return value as CalendarColor
  let hash = 0
  for (const character of userId) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0
  return calendarColors[hash % calendarColors.length]?.id ?? 'forest'
}
