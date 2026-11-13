import { createContext, useContext } from 'react'

import type { Estimate } from '@/shared/domain/types'

import { patchEstimate } from '../application/estimate-actions'

type EstimateDraft = {
  estimate: Estimate
  patch: typeof patchEstimate
  busy: boolean
  submitted: boolean
  error: string | null
}

const EstimateDraftContext = createContext<EstimateDraft | null>(null)

export const EstimateDraftProvider = EstimateDraftContext.Provider
export const useEstimateDraft = () => useContext(EstimateDraftContext)

/** Existing estimates persist immediately; new estimates only update their local form. */
export function usePatchEstimate(): typeof patchEstimate {
  return useEstimateDraft()?.patch ?? patchEstimate
}
