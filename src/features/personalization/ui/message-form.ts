import type { Tenant } from '@/shared/domain/types'

export type MessageForm = {
  emailFromName: string
  emailSignature: string
  estimateEmailIntro: string
  invoiceEmailIntro: string
  documentFooter: string
}

export function messageForm(tenant: Tenant): MessageForm {
  return {
    emailFromName: tenant.emailFromName ?? '',
    emailSignature: tenant.emailSignature ?? '',
    estimateEmailIntro: tenant.estimateEmailIntro ?? '',
    invoiceEmailIntro: tenant.invoiceEmailIntro ?? '',
    documentFooter: tenant.documentFooter ?? '',
  }
}

export function messageFormValid(form: MessageForm) {
  return (
    form.emailFromName.length <= 80 &&
    form.emailSignature.length <= 500 &&
    form.estimateEmailIntro.length <= 1000 &&
    form.invoiceEmailIntro.length <= 1000
  )
}

export function messagePatch(form: MessageForm): Omit<MessageForm, 'documentFooter'> {
  return {
    emailFromName: form.emailFromName.trim(),
    emailSignature: form.emailSignature.trim(),
    estimateEmailIntro: form.estimateEmailIntro.trim(),
    invoiceEmailIntro: form.invoiceEmailIntro.trim(),
  }
}
