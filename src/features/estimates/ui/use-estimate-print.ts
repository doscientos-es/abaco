import { toast } from '@doscientos/ui'
import { useRef } from 'react'

import { printDocument } from '@/shared/lib/print-document'

export function useEstimatePrint() {
  const documentRef = useRef<HTMLElement>(null)
  function print() {
    const element = documentRef.current
    if (element)
      void (async () => {
        let timeout: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([
            Promise.all([
              document.fonts?.ready,
              ...Array.from(element.querySelectorAll('img'), (image) => image.decode()),
            ]),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(
                () => reject(new Error('El documento tarda demasiado en cargar.')),
                15_000,
              )
            }),
          ])
        } finally {
          clearTimeout(timeout)
        }
        // Let the preview recalculate its pages before printDocument clones them.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        )
        await printDocument(element, 'Presupuesto')
      })().catch(() => {
        toast.error('No se pudo preparar el presupuesto para imprimir.')
      })
  }
  return { documentRef, print }
}
