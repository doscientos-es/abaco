import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/** CSS columns fragment the same content that is clipped into each A4 sheet. */
export function estimatePageCount(scrollWidth: number, columnWidth: number) {
  return columnWidth > 0 ? Math.max(1, Math.ceil((scrollWidth - 1) / columnWidth)) : 1
}

export function EstimatePageFlow({ children }: { children: ReactNode }) {
  const flow = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState(1)

  function measure() {
    const element = flow.current
    if (element) {
      const width = Number.parseFloat(getComputedStyle(element).width)
      setPages(estimatePageCount(element.scrollWidth, width))
    }
  }

  useLayoutEffect(() => {
    const element = flow.current
    if (!element) return
    let active = true
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    document.fonts?.addEventListener('loadingdone', measure)
    void document.fonts?.ready.then(() => {
      if (active) measure()
    })
    return () => {
      active = false
      observer?.disconnect()
      document.fonts?.removeEventListener('loadingdone', measure)
    }
  })

  return Array.from({ length: pages }, (_, index) => (
    <div className="estimate-document__page" key={index} aria-hidden={index ? true : undefined}>
      <div className="estimate-document__viewport">
        <div
          className="estimate-document__flow"
          ref={index === 0 ? flow : undefined}
          style={{ transform: `translateX(-${index * 100}%)` }}
          onLoadCapture={index === 0 ? measure : undefined}
        >
          {children}
        </div>
      </div>
    </div>
  ))
}
