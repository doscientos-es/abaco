import type { ReceiptSuggestion } from '../domain/suggestions'
import { aiDocument, requestSuggestion } from './ai-actions'

type Result =
  | { status: 'success'; suggestion: ReceiptSuggestion }
  | { status: 'error'; message: string }
  | { status: 'obsolete' }

/** Obsolete results never reach a form after a file change, removal or dialog close. */
export function createReceiptAnalysis(tenantId: string) {
  let version = 0
  return {
    cancel() {
      version += 1
    },
    async analyze(file: File): Promise<Result> {
      const current = ++version
      try {
        const document = await aiDocument(file)
        if (current !== version) return { status: 'obsolete' }
        const suggestion = await requestSuggestion(tenantId, { task: 'receipt', document })
        if (current !== version) return { status: 'obsolete' }
        return { status: 'success', suggestion }
      } catch (cause) {
        if (current !== version) return { status: 'obsolete' }
        return {
          status: 'error',
          message: cause instanceof Error ? cause.message : 'No se pudo analizar el justificante.',
        }
      }
    },
  }
}
