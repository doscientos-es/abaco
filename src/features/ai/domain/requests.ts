export type AiDocument = {
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'
  data: string
}

export type AiRequest =
  | { task: 'receipt'; document: AiDocument }
  | {
      task: 'estimate'
      messages: { role: 'user' | 'model'; text: string }[]
      document?: AiDocument
    }
