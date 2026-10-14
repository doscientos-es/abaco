/** Print an unscaled copy of the visible document, without app navigation or clipped scroll areas. */
export async function printDocument(element: HTMLElement, title: string): Promise<void> {
  const frame = document.createElement('iframe')
  frame.title = 'Documento para guardar como PDF'
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0'
  document.body.append(frame)

  const printWindow = frame.contentWindow
  const frameDocument = frame.contentDocument
  if (!printWindow || !frameDocument) {
    frame.remove()
    throw new Error('No se ha podido preparar el documento.')
  }

  let cleanupTimeout: ReturnType<typeof setTimeout> | undefined
  const cleanup = () => {
    clearTimeout(cleanupTimeout)
    frame.remove()
  }
  let readinessTimeout: ReturnType<typeof setTimeout> | undefined
  try {
    frameDocument.title = title
    frameDocument.documentElement.lang = 'es'
    frameDocument.body.className = 'invoice-print'
    const styles = Array.from(
      document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style'),
    ).map((source) => {
      const copy = source.cloneNode(true) as HTMLLinkElement | HTMLStyleElement
      const ready = source.tagName === 'LINK'
        ? new Promise<void>((resolve, reject) => {
            const link = copy as HTMLLinkElement
            link.href = (source as HTMLLinkElement).href
            link.onload = () => resolve()
            link.onerror = () => reject(new Error('No se ha podido cargar el estilo del documento.'))
          })
        : Promise.resolve()
      frameDocument.head.append(copy)
      return ready
    })
    frameDocument.body.append(element.cloneNode(true))

    const assetsReady = async () => {
      await Promise.all(styles)
      await frameDocument.fonts?.ready
      await Promise.all(Array.from(frameDocument.images, (image) => image.decode()))
    }
    await Promise.race([
      assetsReady(),
      new Promise<never>((_, reject) => {
        readinessTimeout = setTimeout(() => reject(new Error('El documento tarda demasiado en cargar.')), 15_000)
      }),
    ])
    clearTimeout(readinessTimeout)
    await new Promise<void>((resolve) => printWindow.requestAnimationFrame(() => resolve()))
    printWindow.addEventListener('afterprint', cleanup, { once: true })
    // Some browsers omit afterprint when the dialog is cancelled.
    cleanupTimeout = setTimeout(cleanup, 600_000)
    printWindow.focus()
    printWindow.print()
  } catch (error) {
    cleanup()
    throw error
  } finally {
    clearTimeout(readinessTimeout)
  }
}
