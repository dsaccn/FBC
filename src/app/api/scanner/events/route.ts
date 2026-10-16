import { scannerEmitter, VerificationEvent } from '@/lib/scanner-events'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // 1. Send initial connected event
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'CONNECTED', time: new Date().toISOString() })}\n\n`))

      // 2. Real-time verification event handler
      const onVerification = (event: VerificationEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          scannerEmitter.off('verification', onVerification)
        }
      }

      scannerEmitter.on('verification', onVerification)

      // 3. Heartbeat every 15s to keep connection healthy
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`))
        } catch {
          clearInterval(heartbeat)
          scannerEmitter.off('verification', onVerification)
        }
      }, 15000)

      // 4. Cleanup on disconnect
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        scannerEmitter.off('verification', onVerification)
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
