import { useCallback, useEffect, useRef, useState } from "react";
import type { DetectedEntity } from "@shared/entity-detection";
import type {
  EntityDetectionRequest,
  EntityDetectionResponse,
} from "@/workers/entity-detector.worker";

interface UseEntityDetectionOptions {
  content: string | { id: string; content: string }[] | null;
  minConfidence?: "high" | "medium" | "low";
  debounceMs?: number;
  enabled?: boolean;
}

interface UseEntityDetectionResult {
  entities: DetectedEntity[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook for detecting entities in content using a Web Worker.
 *
 * This runs entity detection in a background thread to avoid impacting
 * typing latency in the main UI thread.
 *
 * @param content - The content to analyze (string or array of content blocks)
 * @param minConfidence - Minimum confidence level to include (default: "low")
 * @param debounceMs - Time to wait after content changes before detecting (default: 500ms)
 * @param enabled - Whether detection is enabled (default: true)
 */
export function useEntityDetection({
  content,
  minConfidence = "low",
  debounceMs = 500,
  enabled = true,
}: UseEntityDetectionOptions): UseEntityDetectionResult {
  const [entities, setEntities] = useState<DetectedEntity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const latestRequestIdRef = useRef(0);

  // Initialize worker
  useEffect(() => {
    // Create worker using Vite's worker import syntax
    workerRef.current = new Worker(
      new URL("../workers/entity-detector.worker.ts", import.meta.url),
      { type: "module" }
    );

    workerRef.current.onmessage = (
      event: MessageEvent<EntityDetectionResponse>
    ) => {
      const { id, entities: detectedEntities, error: detectionError } = event.data;

      // Ignore responses from stale requests
      if (parseInt(id) < latestRequestIdRef.current) {
        return;
      }

      if (detectionError) {
        setError(detectionError);
        setEntities([]);
      } else {
        setError(null);
        setEntities(detectedEntities);
      }
      setIsLoading(false);
    };

    workerRef.current.onerror = (event) => {
      setError(event.message || "Worker error");
      setIsLoading(false);
    };

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Detect entities when content changes
  useEffect(() => {
    if (!enabled || !content || !workerRef.current) {
      setEntities([]);
      setIsLoading(false);
      return;
    }

    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setIsLoading(true);

    debounceTimerRef.current = setTimeout(() => {
      requestIdRef.current += 1;
      latestRequestIdRef.current = requestIdRef.current;

      const request: EntityDetectionRequest = {
        id: String(requestIdRef.current),
        content,
        minConfidence,
      };

      workerRef.current?.postMessage(request);
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [content, minConfidence, debounceMs, enabled]);

  return {
    entities,
    isLoading,
    error,
  };
}
