// @ts-nocheck
/**
 * Server-Sent Events (SSE) for real-time story updates.
 * Lightweight alternative to WebSocket — works through proxies, CDNs, and Vercel rewrites.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface SSEClient {
  id: string;
  reply: FastifyReply;
}

const clients: SSEClient[] = [];
let clientIdCounter = 0;

export function registerSSERoutes(app: FastifyInstance) {
  // GET /api/v1/stream - SSE endpoint for real-time updates
  app.get('/stream', async (request: FastifyRequest, reply: FastifyReply) => {
    const clientId = `sse-${++clientIdCounter}`;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send initial connection message
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

    const client: SSEClient = { id: clientId, reply };
    clients.push(client);

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(`: heartbeat\n\n`);
      } catch {
        clearInterval(heartbeat);
      }
    }, 30000);

    // Clean up on disconnect
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      const index = clients.findIndex((c) => c.id === clientId);
      if (index !== -1) clients.splice(index, 1);
    });
  });
}

/**
 * Broadcast an event to all connected SSE clients.
 */
export function broadcastSSE(event: string, data: unknown): void {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (let i = clients.length - 1; i >= 0; i--) {
    try {
      clients[i].reply.raw.write(message);
    } catch {
      clients.splice(i, 1);
    }
  }
}

/**
 * Get current connected client count.
 */
export function getSSEClientCount(): number {
  return clients.length;
}
