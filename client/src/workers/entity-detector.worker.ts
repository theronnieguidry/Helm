/**
 * Web Worker for Entity Detection (PRD-002)
 *
 * Runs entity detection in a background thread to avoid impacting
 * typing latency in the main UI thread.
 */
import {
  detectEntities,
  filterEntitiesByConfidence,
  type DetectedEntity,
  type EntityType,
} from "@shared/entity-detection";

export interface EntityDetectionRequest {
  id: string;
  content: string | { id: string; content: string }[];
  minConfidence?: "high" | "medium" | "low";
}

export interface EntityDetectionResponse {
  id: string;
  entities: DetectedEntity[];
  error?: string;
}

self.onmessage = (event: MessageEvent<EntityDetectionRequest>) => {
  const { id, content, minConfidence = "low" } = event.data;

  try {
    const entities = detectEntities(content);
    const filteredEntities = filterEntitiesByConfidence(entities, minConfidence);

    const response: EntityDetectionResponse = {
      id,
      entities: filteredEntities,
    };

    self.postMessage(response);
  } catch (error) {
    const response: EntityDetectionResponse = {
      id,
      entities: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };

    self.postMessage(response);
  }
};
