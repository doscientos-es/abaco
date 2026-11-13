export const signedContractBucket = 'signed-contracts'
export const signedContractMaxBytes = 15 * 1024 * 1024

export async function validateSignedContractPdf(file: File): Promise<void> {
  if (file.type !== 'application/pdf' || file.size < 5 || file.size > signedContractMaxBytes)
    throw new Error('Adjunta un PDF de hasta 15 MB.')
  const header = await file.slice(0, 5).text()
  if (header !== '%PDF-') throw new Error('El archivo seleccionado no es un PDF válido.')
}
