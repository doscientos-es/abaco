const imageTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const

type UploadRules = {
  types: Readonly<Record<string, string>>
  maxMiB: number
  formats: string
}

export const logoUpload = { types: imageTypes, maxMiB: 2, formats: 'JPG, PNG o WebP' }
export const receiptUpload = {
  types: { 'application/pdf': 'pdf', ...imageTypes },
  maxMiB: 15,
  formats: 'PDF, JPG, PNG o WebP',
}

export function uploadHint(rules: UploadRules) {
  return `${rules.formats} · máximo ${rules.maxMiB} MB por archivo.`
}

export function uploadExtension(file: File, rules: UploadRules): string {
  const extension = rules.types[file.type]
  if (!Object.hasOwn(rules.types, file.type) || extension === undefined) {
    throw new Error(`Selecciona un archivo en formato ${rules.formats}.`)
  }
  if (file.size === 0 || file.size > rules.maxMiB * 1024 * 1024) {
    throw new Error(`El archivo está vacío o supera los ${rules.maxMiB} MB.`)
  }
  return extension
}
