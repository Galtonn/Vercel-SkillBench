"use client";

import { useEffect, useRef, useState } from "react";

import type { EvaluationProgressView } from "@/lib/types";

type State = {
  progress: EvaluationProgressView | null;
  finished: boolean;
  streamError: string | null;
};

/**
 * Subscribes to an evaluation's server-sent progress stream.
 *
 * The values come from persisted run state, so the bar only advances when an
 * agent run has actually finished. If the stream drops, the hook falls back to
 * polling the evaluation endpoint rather than inventing progress.
 */
export function useEvaluationProgress(
  id: string | null,
  initial: EvaluationProgressView | null = null,
): State {
  const [progress, setProgress] = useState<EvaluationProgressView | null>(initial);
  const [finished, setFinished] = useState(
    initial ? initial.status !== "running" : false,
  );
  const [streamError, setStreamError] = useState<string | null>(null);
  const finishedRef = useRef(finished);

  useEffect(() => {
    finishedRef.current = finished;
  }, [finished]);

  useEffect(() => {
    if (!id) return;

    let closed = false;
    let source: EventSource | null = null;
    let pollTimer: number | null = null;

    const finish = () => {
      if (closed) return;
      closed = true;
      source?.close();
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      setFinished(true);
    };

    const poll = async () => {
      if (closed) return;
      try {
        const response = await fetch(`/api/evaluations/${id}`, {
          cache: "no-store",
        });
        if (response.ok) {
          const body = (await response.json()) as {
            progress: EvaluationProgressView;
          };
          setProgress(body.progress);
          if (body.progress.status !== "running") {
            finish();
            return;
          }
        }
      } catch {
        // Keep polling; a transient failure is not an evaluation failure.
      }
      if (!closed) pollTimer = window.setTimeout(poll, 1500);
    };

    try {
      source = new EventSource(`/api/evaluations/${id}/events`);

      source.addEventListener("progress", (event) => {
        const data = JSON.parse((event as MessageEvent<string>).data) as
          EvaluationProgressView;
        setProgress(data);
      });

      source.addEventListener("done", () => {
        finish();
      });

      source.addEventListener("failed", (event) => {
        const data = JSON.parse((event as MessageEvent<string>).data) as {
          message: string;
        };
        setStreamError(data.message);
        finish();
      });

      source.onerror = () => {
        // The connection dropped. If the run is still going, switch to polling.
        if (finishedRef.current || closed) return;
        source?.close();
        source = null;
        if (pollTimer === null) pollTimer = window.setTimeout(poll, 1000);
      };
    } catch {
      void poll();
    }

    return () => {
      closed = true;
      source?.close();
      if (pollTimer !== null) window.clearTimeout(pollTimer);
    };
  }, [id]);

  return { progress, finished, streamError };
}
