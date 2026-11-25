export { useAiAccess } from './application/ai-access'
export type { ClientProposal } from './domain/chat-tools'
export {
  applyReceiptSuggestion,
  resetReceiptAutofill,
  type ReceiptFields,
} from './domain/suggestions'
export { AiTestSettings } from './ui/ai-test-settings'
export { AiChatProvider, useAiChat } from './ui/chat-context'
export { ReceiptAiReview } from './ui/receipt-ai-review'
