import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Scale the paper, not its layout: small screens see the exact same A4 document. */
export function DocumentPreview({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const element = container.current
    if (!element) return
    const resize = () => setScale(Math.min(1, element.clientWidth / ((210 * 96) / 25.4)))
    resize()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', resize)
      return () => window.removeEventListener('resize', resize)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <section aria-label="Vista previa del documento" className="min-w-0 space-y-3">
      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs print:hidden">
        <span className="font-medium">Vista previa de la factura</span>
        <span>A4 · El mismo documento que guardarás en PDF</span>
      </div>
      <div className="border-border bg-muted/70 rounded-xl border p-3 sm:p-5 print:border-0 print:bg-transparent print:p-0">
        <div ref={container} className="min-w-0 overflow-x-auto">
          <div className="mx-auto w-fit" style={{ zoom: scale }}>
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}
