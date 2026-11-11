export const contractStatusLabels = {
  draft: 'Borrador',
  active: 'Activo',
  paused: 'Pausado',
  expired: 'Vencido',
  canceled: 'Cancelado',
} as const

export type ContractStatus = keyof typeof contractStatusLabels
