/**
 * GET /api/stream/[id]  →  text/event-stream
 *
 * Reads run input from KV, runs the workflow inline, streams SSE events.
 * Workflow lifetime == this handler's lifetime — when client disconnects or
 * workflow finishes, the function exits.
 *
 * Vercel maxDuration is set to 800s in vercel.json for this route.
 */

import { kvGet, KV_KEYS } from '@/lib/kv';
import { runDecision } from '@/workflows/runDecision';

export const config = { runtime: 'nodejs', api: { bodyParser: false } };

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) {
    res.status(400).end('missing id');
    return;
  }
  const input = await kvGet(KV_KEYS.runInput(id));
  if (!input) {
    res.status(404).end('unknown run');
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const emit = (event, data) => {
    try {
      res.write(sse(event, data));
    } catch (err) {
      console.error('[stream] write failed', err);
    }
  };

  // Heartbeat every 15s to keep proxies happy
  const heartbeat = setInterval(() => {
    try { res.write(`:heartbeat\n\n`); } catch {}
  }, 15000);

  let closed = false;
  req.on('close', () => { closed = true; });

  try {
    res.write(`:connected\n\n`);
    await runDecision({
      runId: id,
      ticker: input.ticker,
      date: input.date,
      userContext: input.userContext,
      modelProvider: input.modelProvider,
      modelTier: input.modelTier,
      emit,
    });
  } catch (e) {
    console.error('[stream] workflow failed', { id, message: e.message, stack: e.stack });
    if (!closed) emit('error', { message: e.message, stack: e.stack?.slice(0, 500) });
  } finally {
    clearInterval(heartbeat);
    try { res.end(); } catch {}
  }
}
