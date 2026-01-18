/**
 * PRD-016: AI Service Factory
 *
 * Factory for creating AI provider instances based on environment configuration.
 */

import type { AIProvider } from "./ai-provider";
import { ClaudeAIProvider } from "./claude-provider";
import { MockAIProvider } from "./mock-provider";

export * from "./ai-provider";
export { ClaudeAIProvider } from "./claude-provider";
export { MockAIProvider } from "./mock-provider";

/**
 * Create an AI provider instance based on environment configuration.
 *
 * - If ANTHROPIC_API_KEY is set, uses Claude API
 * - Otherwise, uses mock provider (for development/testing)
 */
export function createAIProvider(): AIProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn("ANTHROPIC_API_KEY not set, using mock AI provider");
    return new MockAIProvider();
  }

  return new ClaudeAIProvider(apiKey);
}

/**
 * Create a mock AI provider for testing.
 * This provides explicit control over classification results.
 */
export function createMockAIProvider(): MockAIProvider {
  return new MockAIProvider();
}
