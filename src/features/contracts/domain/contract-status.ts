// Keep the persisted lifecycle: scheduling and billing depend on these values.
// Only an active contract is operational; every other state is inactive.
export const contractStatusLabels = {
  draft: 'Inactivo',
  active: 'Activo',
  paused: 'Inactivo',
  expired: 'Inactivo',
  canceled: 'Inactivo',
} as const

export type ContractStatus = keyof typeof contractStatusLabels
export type ContractStatusFilter = 'all' | 'active' | 'inactive'
