/**
 * BullMQ-compatible event mappings for OJS.
 *
 * Translates between BullMQ event names and OJS event types so that
 * code written against BullMQ's `.on(event, handler)` API can work
 * transparently over an OJS backend.
 */

import type { OJSEvent, OJSEventType } from '@openjobspec/sdk';
import { toCompatJob } from './types.js';

// ---------------------------------------------------------------------------
// Event name mapping
// ---------------------------------------------------------------------------

/** BullMQ event names mapped to their OJS equivalents. */
export const EVENT_MAP = {
  completed: 'job.completed',
  failed: 'job.failed',
  error: 'job.failed',
  progress: 'job.progress',
  active: 'job.started',
  waiting: 'job.enqueued',
  delayed: 'job.scheduled',
  stalled: 'job.retrying',
} as const;

/** A BullMQ event name that we know how to map. */
export type BullMQEventName = keyof typeof EVENT_MAP;

/** The OJS event type that corresponds to a BullMQ event name. */
export type OjsEventName = (typeof EVENT_MAP)[BullMQEventName];

// ---------------------------------------------------------------------------
// Mapping functions
// ---------------------------------------------------------------------------

/**
 * Convert a BullMQ event name to its OJS event type string.
 *
 * @param bullEvent - A BullMQ-style event name (e.g. `'completed'`).
 * @returns The corresponding OJS event type (e.g. `'job.completed'`).
 * @throws {Error} If the event name is not recognized.
 */
export function mapEventName(bullEvent: BullMQEventName): OjsEventName {
  const mapped = EVENT_MAP[bullEvent];
  if (!mapped) {
    throw new Error(`Unknown BullMQ event: ${String(bullEvent)}`);
  }
  return mapped;
}

/**
 * Convert an OJS event envelope into a BullMQ-compatible event payload.
 *
 * The returned shape mimics what BullMQ would pass to a `.on()` handler:
 * - `completed` / `failed` / `active` → a BullMQ-shaped job object
 * - `progress` → `{ jobId, data }`
 * - everything else → the raw OJS event data
 *
 * @param ojsEvent - Raw OJS event (typically an {@link OJSEvent}).
 * @param bullEventName - The BullMQ event name the caller registered for.
 * @returns A BullMQ-compatible event payload.
 */
export function toCompatEvent(
  ojsEvent: unknown,
  bullEventName: BullMQEventName,
): unknown {
  const event = ojsEvent as OJSEvent;

  switch (bullEventName) {
    case 'completed':
    case 'failed':
    case 'active':
    case 'stalled':
      return event.data && typeof event.data === 'object' && 'id' in event.data
        ? toCompatJob(event.data)
        : event.data;

    case 'progress': {
      const data = event.data as Record<string, unknown>;
      return {
        jobId: data.job_id ?? event.subject,
        data: data.progress ?? data,
      };
    }

    case 'waiting':
    case 'delayed':
      return event.data;

    case 'error':
      return event.data && typeof event.data === 'object' && 'message' in event.data
        ? new Error((event.data as { message: string }).message)
        : event.data;

    default:
      return event.data;
  }
}

/**
 * Check whether a string is a recognized BullMQ event name.
 *
 * @param name - Candidate event name.
 * @returns `true` if the name exists in {@link EVENT_MAP}.
 */
export function isBullMQEvent(name: string): name is BullMQEventName {
  return name in EVENT_MAP;
}

/**
 * Return the full set of OJS event types that correspond to the
 * mapped BullMQ events. Useful for building subscription filters.
 */
export function allMappedOjsEvents(): OJSEventType[] {
  return [...new Set(Object.values(EVENT_MAP))] as OJSEventType[];
}
