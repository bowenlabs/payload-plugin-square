type Controller = ReadableStreamDefaultController<Uint8Array>

const connections = new Set<Controller>()

export function addConnection(controller: Controller) {
  connections.add(controller)
}

export function removeConnection(controller: Controller) {
  connections.delete(controller)
}

export function broadcastInventoryUpdate(variationSquareId: string, quantity: number) {
  const data = JSON.stringify({ variationSquareId, quantity })
  const chunk = new TextEncoder().encode(`data: ${data}\n\n`)
  for (const controller of connections) {
    try {
      controller.enqueue(chunk)
    } catch {
      connections.delete(controller)
    }
  }
}
