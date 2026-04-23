import type { PayloadHandler } from 'payload'

import { addConnection, removeConnection } from '../lib/inventoryBroadcast.js'

export const inventoryStreamHandler: PayloadHandler = () => {
  const encoder = new TextEncoder()

  let controller: ReadableStreamDefaultController<Uint8Array>

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
      addConnection(controller)
      // Keep-alive comment so the connection doesn't time out immediately
      controller.enqueue(encoder.encode(': connected\n\n'))
    },
    cancel() {
      removeConnection(controller)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
