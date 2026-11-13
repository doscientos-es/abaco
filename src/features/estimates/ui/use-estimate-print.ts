import { toast } from '@doscientos/ui'
import { useRef } from 'react'

import { printDocument } from '@/shared/lib/print-document'

export function useEstimatePrint() {
  const documentRef = useRef<HTMLElement>(null)
  function print() {
    if (documentRef.current)
      void printDocument(documentRef.current, 'Presupuesto').catch(() => {
        toast.error('No se pudo preparar el presupuesto para imprimir.')
      })
  }
  return { documentRef, print }
}
