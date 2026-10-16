import { EventEmitter } from 'events'

// Global singleton across Next.js dev server & runtime
const globalForEvents = globalThis as unknown as {
  scannerEmitter: EventEmitter | undefined
}

export const scannerEmitter = globalForEvents.scannerEmitter ?? new EventEmitter()
if (!globalForEvents.scannerEmitter) {
  scannerEmitter.setMaxListeners(100)
  globalForEvents.scannerEmitter = scannerEmitter
}

export interface VerificationEvent {
  type: 'ORDER_VERIFIED' | 'ORDER_CLEARED' | 'RECEIPT_SCANNED'
  orderId?: string
  tableNumber?: string
  reference?: string
  provider?: string
  amount?: number
  payerName?: string
  receiverName?: string
  timestamp: string
}

export function broadcastVerificationEvent(event: VerificationEvent) {
  try {
    scannerEmitter.emit('verification', event)
  } catch (err) {
    console.warn('[broadcastVerificationEvent error]', err)
  }
}
