export const contractBillingLabels = {
  once: 'Importe único',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  yearly: 'Anual',
} as const

export type ContractBillingFrequency = keyof typeof contractBillingLabels
