export const workerDocumentAccept = 'application/pdf,image/jpeg,image/png,image/webp'
const allowedTypes = workerDocumentAccept.split(',')
const maxBytes = 15 * 1024 * 1024

export type WorkerDocumentType = 'pdf' | 'image' | 'other'

/** Documents only store the original name, so the type is inferred from its extension. */
export function workerDocumentType(name: string): WorkerDocumentType {
  const extension = name.trim().split('.').pop()?.toLowerCase()
  if (!name.trim().includes('.')) return 'other'
  if (extension === 'pdf') return 'pdf'
  if (extension && ['jpg', 'jpeg', 'png', 'webp'].includes(extension)) return 'image'
  return 'other'
}

export function validateWorkerDocumentFile(file: File) {
  if (!allowedTypes.includes(file.type) || file.size === 0 || file.size > maxBytes) {
    return 'Usa un PDF, JPEG, PNG o WebP de hasta 15 MB.'
  }
  if (!file.name.trim()) return 'El documento debe tener un nombre.'
  return null
}
