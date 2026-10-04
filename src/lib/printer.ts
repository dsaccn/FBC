/**
 * Utility for printing tickets/receipts directly without opening an external browser tab/window.
 * Creates an in-page hidden iframe so the native print dialog pops out directly on its own tab.
 */
export function printTicketHtml(htmlContent: string) {
  if (typeof window === 'undefined') return

  const printFrame = document.createElement('iframe')
  printFrame.style.position = 'fixed'
  printFrame.style.top = '-10000px'
  printFrame.style.left = '-10000px'
  printFrame.style.width = '0'
  printFrame.style.height = '0'
  printFrame.style.border = 'none'
  document.body.appendChild(printFrame)

  const frameDoc = printFrame.contentDocument || printFrame.contentWindow?.document
  if (frameDoc) {
    frameDoc.open()
    frameDoc.write(htmlContent)
    frameDoc.close()

    setTimeout(() => {
      try {
        printFrame.contentWindow?.focus()
        printFrame.contentWindow?.print()
      } catch (err) {
        console.error('Print error:', err)
      } finally {
        setTimeout(() => {
          try {
            if (printFrame.parentNode) {
              document.body.removeChild(printFrame)
            }
          } catch {}
        }, 1500)
      }
    }, 250)
  }
}
