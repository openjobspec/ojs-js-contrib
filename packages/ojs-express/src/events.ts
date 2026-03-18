// Node 18+ provides fetch, AbortController, TextDecoder as globals.
// These declarations satisfy tsc when `lib` does not include "DOM".
declare const fetch: (url: string, init?: { headers?: Record<string, string>; signal?: unknown }) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  body: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> } } | null;
}>;
declare class AbortController { signal: unknown; abort(): void; }
declare class TextDecoder { decode(input?: Uint8Array, options?: { stream?: boolean }): string; }

import type { Request, Response, NextFunction, RequestHandler } from 'express';

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

/** Options for creating an OJS event emitter or SSE proxy. */
export interface OjsEventOptions {
  /** OJS server base URL (e.g. 'http://localhost:8080'). */
  url: string;
  /** Event types to subscribe to. If empty, subscribes to all events. */
  events?: string[];
}

/** Data payload for an OJS lifecycle event. */
export interface OjsEventData {
  type: string;
  jobId: string;
  jobType: string;
  queue: string;
  state: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

type EventHandler = (data: OjsEventData) => void;

/** An event emitter that subscribes to OJS server events via SSE. */
export interface OjsEventEmitter {
  /** Register an event handler. */
  on(event: string, handler: EventHandler): OjsEventEmitter;
  /** Remove an event handler. */
  off(event: string, handler: EventHandler): OjsEventEmitter;
  /** Start listening for events from the OJS server. */
  start(): Promise<void>;
  /** Stop listening for events. */
  stop(): void;
}

/**
 * Creates an event emitter that subscribes to OJS server events via SSE.
 *
 * Connects to the OJS server's /events/stream endpoint using Server-Sent Events
 * and dispatches parsed events to registered handlers.
 *
 * @example
 * ```ts
 * import { createOjsEventEmitter } from '@openjobspec/express';
 *
 * const events = createOjsEventEmitter({ url: process.env.OJS_URL });
 * events.on('job.completed', (data) => console.log('Job done:', data.jobId));
 * events.on('job.failed', (data) => alerting.notify(data));
 * await events.start();
 *
 * // Later:
 * events.stop();
 * ```
 */
export function createOjsEventEmitter(options: OjsEventOptions): OjsEventEmitter {
  const listeners = new Map<string, Set<EventHandler>>();
  let controller: AbortController | null = null;
  let active = false;

  function emit(event: OjsEventData): void {
    const typeHandlers = listeners.get(event.type);
    const allHandlers = listeners.get('*');

    if (typeHandlers) {
      for (const handler of typeHandlers) {
        handler(event);
      }
    }
    if (allHandlers) {
      for (const handler of allHandlers) {
        handler(event);
      }
    }
  }

  const emitter: OjsEventEmitter = {
    on(event: string, handler: EventHandler) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(handler);
      return emitter;
    },

    off(event: string, handler: EventHandler) {
      const handlers = listeners.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          listeners.delete(event);
        }
      }
      return emitter;
    },

    async start() {
      if (active) return;
      active = true;
      controller = new AbortController();

      const eventsParam = options.events?.length
        ? `?events=${options.events.join(',')}`
        : '';
      const url = `${options.url}/events/stream${eventsParam}`;

      const response = await fetch(url, {
        headers: { Accept: 'text/event-stream' },
        signal: controller.signal,
      });

      if (!response.ok) {
        active = false;
        throw new Error(`Failed to connect to OJS event stream: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        active = false;
        throw new Error('Response body is null — SSE stream not available');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processStream = async () => {
        try {
          while (active) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6)) as OjsEventData;
                  emit(data);
                } catch {
                  // Skip malformed event data
                }
              }
            }
          }
        } catch (err) {
          if (active && !isAbortError(err)) {
            throw err;
          }
        }
      };

      processStream().catch(() => {
        // Stream ended — suppress errors after stop()
      });
    },

    stop() {
      active = false;
      if (controller) {
        controller.abort();
        controller = null;
      }
    },
  };

  return emitter;
}

/**
 * Express middleware that provides an SSE proxy for OJS events.
 *
 * Forwards OJS server events to connected browser clients using
 * Server-Sent Events. Clients connect via GET and receive a stream
 * of OJS lifecycle events.
 *
 * @example
 * ```ts
 * import { ojsEventStream } from '@openjobspec/express';
 *
 * app.get('/events/jobs', ojsEventStream({ url: process.env.OJS_URL }));
 * // Browser: const es = new EventSource('/events/jobs');
 * ```
 */
export function ojsEventStream(options: OjsEventOptions): RequestHandler {
  return async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders();

    const eventsParam = options.events?.length
      ? `?events=${options.events.join(',')}`
      : '';
    const url = `${options.url}/events/stream${eventsParam}`;

    let controller: AbortController | null = new AbortController();

    req.on('close', () => {
      controller?.abort();
      controller = null;
    });

    try {
      const response = await fetch(url, {
        headers: { Accept: 'text/event-stream' },
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        res.write(`data: ${JSON.stringify({ error: 'Failed to connect to OJS event stream' })}\n\n`);
        res.end();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }
    } catch (err) {
      if (!isAbortError(err)) {
        res.write(`data: ${JSON.stringify({ error: 'Event stream disconnected' })}\n\n`);
      }
    } finally {
      res.end();
    }
  };
}
