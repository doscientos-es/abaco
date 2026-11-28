export const PRACTICE_NOTE_LIMIT = 400

export const practiceVisits = {
  climatizacion: {
    title: 'Revisión de climatización',
    site: 'Centro de formación (ficticio)',
    request: 'El equipo tarda en enfriar. Revisa el filtro y comprueba el funcionamiento.',
    tasks: ['Revisar el estado del filtro', 'Comprobar que sale aire frío'],
    example: 'Limpié el filtro y comprobé que el equipo vuelve a enfriar.',
  },
  iluminacion: {
    title: 'Incidencia de iluminación',
    site: 'Almacén de ejemplo (ficticio)',
    request: 'Una luz de la zona de acceso no se enciende. Comprueba su estado y el resultado.',
    tasks: ['Identificar la luminaria que falla', 'Comprobar el encendido después de la revisión'],
    example: 'Identifiqué la luminaria de acceso y confirmé que vuelve a encenderse.',
  },
} as const

type VisitId = keyof typeof practiceVisits

type Report = { visitId: VisitId; checked: boolean[]; note: string }
type PracticeState =
  | { step: 'choose' }
  | { step: 'inspect'; visitId: VisitId }
  | ({ step: 'draft'; error: string | null } & Report)
  | ({ step: 'result' } & Report)

type PracticeAction =
  | { type: 'choose'; visitId: VisitId }
  | { type: 'draft' }
  | { type: 'check'; index: number; checked: boolean }
  | { type: 'note'; value: string }
  | { type: 'simulate' }
  | { type: 'reset' }

export const initialPractice: PracticeState = { step: 'choose' }

export function practiceReducer(state: PracticeState, action: PracticeAction): PracticeState {
  if (action.type === 'reset') return initialPractice
  if (state.step === 'choose' && action.type === 'choose')
    return { step: 'inspect', visitId: action.visitId }
  if (state.step === 'inspect' && action.type === 'draft')
    return {
      step: 'draft',
      visitId: state.visitId,
      checked: practiceVisits[state.visitId].tasks.map(() => false),
      error: null,
      note: '',
    }
  if (state.step !== 'draft') return state

  switch (action.type) {
    case 'check':
      return {
        ...state,
        checked: state.checked.map((checked, index) =>
          index === action.index ? action.checked : checked,
        ),
        error: null,
      }
    case 'note':
      return { ...state, note: action.value.slice(0, PRACTICE_NOTE_LIMIT), error: null }
    case 'simulate': {
      if (!state.checked.every(Boolean) || !state.note.trim())
        return {
          ...state,
          error: 'Marca las dos comprobaciones y escribe una nota antes de simular el envío.',
        }
      return {
        step: 'result',
        visitId: state.visitId,
        checked: state.checked,
        note: state.note.trim(),
      }
    }
    default:
      return state
  }
}
