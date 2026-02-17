import { useState, useEffect, useCallback, useRef } from 'react';

export interface JobStatus {
  id: string;
  state: string;
  result?: unknown;
  error?: { message: string; type?: string };
}

export interface UseJobStatusOptions {
  pollInterval?: number;
  enabled?: boolean;
  onComplete?: (status: JobStatus) => void;
  onError?: (status: JobStatus) => void;
}

const TERMINAL_STATES = ['completed', 'cancelled', 'discarded'];

export function useJobStatus(
  jobId: string | null,
  apiEndpoint: string,
  options: UseJobStatusOptions = {},
): { status: JobStatus | null; isPolling: boolean; error: Error | null; refresh: () => void } {
  const { pollInterval = 1000, enabled = true, onComplete, onError } = options;
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`${apiEndpoint}/${jobId}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data: JobStatus = await res.json();
      setStatus(data);
      setError(null);

      if (TERMINAL_STATES.includes(data.state)) {
        if (data.state === 'completed') onComplete?.(data);
        if (data.state === 'discarded') onError?.(data);
        setIsPolling(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [jobId, apiEndpoint, onComplete, onError]);

  useEffect(() => {
    if (!jobId || !enabled) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    fetchStatus();

    intervalRef.current = setInterval(fetchStatus, pollInterval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [jobId, enabled, pollInterval, fetchStatus]);

  useEffect(() => {
    if (!isPolling && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [isPolling]);

  return { status, isPolling, error, refresh: fetchStatus };
}
