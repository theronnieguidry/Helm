/**
 * PRD-033: Claude AI Provider JSON Parsing Tests
 *
 * Tests for robust JSON extraction from LLM responses.
 */

import { describe, it, expect } from "vitest";
import { ClaudeAIProvider } from "./claude-provider";

// Helper to access private methods for testing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getPrivateMethod = (provider: ClaudeAIProvider, methodName: string): any => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (provider as any)[methodName].bind(provider);
};

describe("ClaudeAIProvider JSON Parsing (PRD-033)", () => {
  // Create provider without API key for testing helper methods
  const provider = new ClaudeAIProvider("test-key");
  const extractJsonFromResponse = getPrivateMethod(provider, "extractJsonFromResponse");
  const repairJson = getPrivateMethod(provider, "repairJson");

  describe("extractJsonFromResponse", () => {
    it("extracts JSON from markdown code block with json tag", () => {
      const response = '```json\n[{"id": "1", "name": "test"}]\n```';
      const result = extractJsonFromResponse(response);
      expect(result).toBe('[{"id": "1", "name": "test"}]');
    });

    it("extracts JSON from markdown code block without json tag", () => {
      const response = '```\n{"key": "value"}\n```';
      const result = extractJsonFromResponse(response);
      expect(result).toBe('{"key": "value"}');
    });

    it("extracts JSON array with text preamble", () => {
      const response = 'Here is the classification result:\n[{"id": "1"}]';
      const result = extractJsonFromResponse(response);
      expect(result).toBe('[{"id": "1"}]');
    });

    it("extracts JSON object with text preamble", () => {
      const response = 'Here is your response: {"entities": [], "relationships": []}';
      const result = extractJsonFromResponse(response);
      expect(result).toBe('{"entities": [], "relationships": []}');
    });

    it("handles nested brackets correctly", () => {
      const response = 'Result: [{"nested": {"deep": [1, 2, 3]}}]';
      const result = extractJsonFromResponse(response);
      expect(result).toBe('[{"nested": {"deep": [1, 2, 3]}}]');
    });

    it("handles strings with brackets inside", () => {
      const response = '[{"text": "This has [brackets] inside"}]';
      const result = extractJsonFromResponse(response);
      expect(result).toBe('[{"text": "This has [brackets] inside"}]');
    });

    it("handles escaped quotes in strings", () => {
      const response = '[{"text": "He said \\"hello\\""}]';
      const result = extractJsonFromResponse(response);
      expect(result).toBe('[{"text": "He said \\"hello\\""}]');
    });

    it("handles text after JSON", () => {
      const response = '[{"id": "1"}]\n\nI hope this helps!';
      const result = extractJsonFromResponse(response);
      expect(result).toBe('[{"id": "1"}]');
    });

    it("throws when no JSON structure found", () => {
      const response = "This is just plain text with no JSON";
      expect(() => extractJsonFromResponse(response)).toThrow("No JSON structure found");
    });

    it("prefers code block over raw JSON when both present", () => {
      const response = 'Here is a preview: {"wrong": true}\n```json\n{"correct": true}\n```';
      const result = extractJsonFromResponse(response);
      expect(result).toBe('{"correct": true}');
    });

    it("handles multiline JSON in code block", () => {
      const response = '```json\n[\n  {\n    "id": "1",\n    "name": "test"\n  }\n]\n```';
      const result = extractJsonFromResponse(response);
      const parsed = JSON.parse(result);
      expect(parsed).toEqual([{ id: "1", name: "test" }]);
    });

    it("handles complex real-world classification response", () => {
      const response = `Here are the classification results for the notes:

[
  {
    "noteId": "note-1",
    "inferredType": "NPC",
    "confidence": 0.95,
    "explanation": "Contains character description",
    "extractedEntities": ["Lord Ashford", "Silverkeep"]
  }
]`;
      const result = extractJsonFromResponse(response);
      const parsed = JSON.parse(result);
      expect(parsed[0].noteId).toBe("note-1");
      expect(parsed[0].extractedEntities).toContain("Lord Ashford");
    });
  });

  describe("repairJson", () => {
    it("removes trailing comma before closing brace", () => {
      const json = '{"key": "value",}';
      const result = repairJson(json);
      expect(result).toBe('{"key": "value"}');
    });

    it("removes trailing comma before closing bracket", () => {
      const json = '["a", "b", "c",]';
      const result = repairJson(json);
      expect(result).toBe('["a", "b", "c"]');
    });

    it("removes multiple trailing commas", () => {
      const json = '[{"a": 1,}, {"b": 2,},]';
      const result = repairJson(json);
      expect(result).toBe('[{"a": 1}, {"b": 2}]');
    });

    it("handles already-valid JSON unchanged", () => {
      const json = '{"key": "value"}';
      const result = repairJson(json);
      expect(result).toBe('{"key": "value"}');
    });

    it("adds missing comma between properties on newlines", () => {
      const json = '{\n  "a": 1\n  "b": 2\n}';
      const result = repairJson(json);
      // Should add comma after 1
      expect(result).toContain('"a": 1,');
    });

    it("handles trailing comma with whitespace", () => {
      const json = '{\n  "key": "value",\n}';
      const result = repairJson(json);
      expect(result).toBe('{\n  "key": "value"\n}');
    });

    it("repairs complex nested structure", () => {
      const json = `{
  "entities": [
    {"name": "Test",},
  ],
}`;
      const result = repairJson(json);
      // Should be parseable after repair
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe("combined extraction and repair", () => {
    it("handles preamble + trailing comma", () => {
      const response = 'Here is the result:\n[{"id": "1",}]';
      const extracted = extractJsonFromResponse(response);
      const repaired = repairJson(extracted);
      const parsed = JSON.parse(repaired);
      expect(parsed).toEqual([{ id: "1" }]);
    });

    it("handles code block with trailing comma", () => {
      const response = '```json\n{"key": "value",}\n```';
      const extracted = extractJsonFromResponse(response);
      const repaired = repairJson(extracted);
      expect(() => JSON.parse(repaired)).not.toThrow();
    });
  });

  describe("repairUnescapedQuotes", () => {
    const repairUnescapedQuotes = getPrivateMethod(provider, "repairUnescapedQuotes");

    it("escapes embedded quotes in string values", () => {
      const input = '{"explanation": "This is the "Blacksmith" guild"}';
      const result = repairUnescapedQuotes(input);
      expect(result).toBe('{"explanation": "This is the \\"Blacksmith\\" guild"}');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it("handles multiple embedded quote pairs", () => {
      const input = '{"text": "The "quick" and "slow" fox"}';
      const result = repairUnescapedQuotes(input);
      expect(result).toBe('{"text": "The \\"quick\\" and \\"slow\\" fox"}');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it("preserves already escaped quotes", () => {
      const input = '{"text": "He said \\"hello\\""}';
      const result = repairUnescapedQuotes(input);
      expect(result).toBe('{"text": "He said \\"hello\\""}');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it("handles nested objects with embedded quotes", () => {
      const input = '{"outer": {"inner": "the "value" here"}}';
      const result = repairUnescapedQuotes(input);
      expect(result).toBe('{"outer": {"inner": "the \\"value\\" here"}}');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it("handles arrays with embedded quotes", () => {
      const input = '["the "first" item", "second"]';
      const result = repairUnescapedQuotes(input);
      expect(result).toBe('["the \\"first\\" item", "second"]');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it("leaves valid JSON unchanged", () => {
      const input = '{"key": "value", "num": 123, "bool": true}';
      const result = repairUnescapedQuotes(input);
      expect(result).toBe(input);
    });

    it("handles empty strings", () => {
      const input = '{"key": ""}';
      const result = repairUnescapedQuotes(input);
      expect(result).toBe(input);
    });

    it("handles quotes at end of value before closing bracket", () => {
      const input = '{"key": "value with "quote""}';
      const result = repairUnescapedQuotes(input);
      expect(result).toBe('{"key": "value with \\"quote\\""}');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it("handles realistic classification response with embedded quotes", () => {
      const input = `[{"noteId": "abc123", "inferredType": "NPC", "confidence": 0.95, "explanation": "The content describes the "Iron Baron" who is a blacksmith", "extractedEntities": ["Iron Baron"]}]`;
      const result = repairUnescapedQuotes(input);
      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed[0].explanation).toContain('"Iron Baron"');
    });

    it("handles mixed escaped and unescaped quotes", () => {
      const input = '{"text": "He said \\"hi\\" and the "Baron" replied"}';
      const result = repairUnescapedQuotes(input);
      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed.text).toBe('He said "hi" and the "Baron" replied');
    });
  });

  describe("repairJson with unescaped quotes (integration)", () => {
    it("repairs embedded quotes through repairJson", () => {
      const input = '{"explanation": "The "Blacksmith" guild"}';
      const result = repairJson(input);
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it("repairs both embedded quotes and trailing commas", () => {
      const input = '{"text": "The "Baron" said",}';
      const result = repairJson(input);
      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed.text).toBe('The "Baron" said');
    });

    it("repairs complex real-world failure case", () => {
      // This simulates the actual error we saw: long explanation at column 107
      const input = `[{"noteId": "86dfc162", "inferredType": "Area", "confidence": 0.95, "explanation": "The content describes a location called "The Homesteads" which contains two other locations", "extractedEntities": ["The Homesteads"]}]`;
      const result = repairJson(input);
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe("repairJson with literal newlines (integration)", () => {
    it("repairs literal newlines through repairJson", () => {
      const input = '{"explanation": "The note describes\na location"}';
      const result = repairJson(input);
      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed.explanation).toBe("The note describes\na location");
    });

    it("repairs literal newlines combined with trailing commas", () => {
      const input = '{"text": "line one\nline two",}';
      const result = repairJson(input);
      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed.text).toBe("line one\nline two");
    });

    it("repairs literal newlines combined with embedded quotes", () => {
      const input = '{"text": "The "Baron" said\nhello"}';
      const result = repairJson(input);
      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed.text).toBe('The "Baron" said\nhello');
    });

    it("repairs real-world LLM classification response with literal newline", () => {
      // This simulates the actual error: "Expected double-quoted property name at position 2381"
      const input = `[{"noteId": "abc123", "inferredType": "Area", "confidence": 0.95, "explanation": "The note describes
a location called The Homesteads which contains two other locations", "extractedEntities": ["The Homesteads"]}]`;
      const result = repairJson(input);
      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed[0].explanation).toContain("The note describes");
      expect(parsed[0].explanation).toContain("a location called The Homesteads");
    });
  });

  describe("combined extraction and repair with newlines (end-to-end)", () => {
    it("handles code block extraction followed by newline repair", () => {
      const response = '```json\n{"explanation": "The note\ndescribes a place"}\n```';
      const extracted = extractJsonFromResponse(response);
      const repaired = repairJson(extracted);
      expect(() => JSON.parse(repaired)).not.toThrow();
      const parsed = JSON.parse(repaired);
      expect(parsed.explanation).toBe("The note\ndescribes a place");
    });

    it("handles preamble extraction followed by newline repair", () => {
      const response = 'Here is the result:\n{"text": "line1\nline2"}';
      const extracted = extractJsonFromResponse(response);
      const repaired = repairJson(extracted);
      expect(() => JSON.parse(repaired)).not.toThrow();
    });
  });

  describe("repairUnescapedQuotes - literal control characters", () => {
    const repairUnescapedQuotes = getPrivateMethod(provider, "repairUnescapedQuotes");

    it("escapes literal newline inside string value", () => {
      const input = '{"text": "line one\nline two"}';
      const result = repairUnescapedQuotes(input);
      expect(result).toBe('{"text": "line one\\nline two"}');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it("escapes literal carriage return inside string value", () => {
      const input = '{"text": "line one\rline two"}';
      const result = repairUnescapedQuotes(input);
      expect(result).toBe('{"text": "line one\\rline two"}');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it("escapes literal tab inside string value", () => {
      const input = '{"text": "col1\tcol2"}';
      const result = repairUnescapedQuotes(input);
      expect(result).toBe('{"text": "col1\\tcol2"}');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it("preserves already-escaped newlines", () => {
      const input = '{"text": "line one\\nline two"}';
      const result = repairUnescapedQuotes(input);
      expect(result).toBe(input);
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it("handles mix of embedded quotes and literal newlines", () => {
      const input = '{"text": "The "Baron" said\nhello"}';
      const result = repairUnescapedQuotes(input);
      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed.text).toBe('The "Baron" said\nhello');
    });

    it("handles multiple literal newlines in one string", () => {
      const input = '{"text": "line1\nline2\nline3"}';
      const result = repairUnescapedQuotes(input);
      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed.text).toBe("line1\nline2\nline3");
    });

    it("handles realistic LLM response with literal newline in explanation", () => {
      const input = `[{"noteId": "abc", "explanation": "The note describes
a location called The Homesteads"}]`;
      const result = repairUnescapedQuotes(input);
      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed[0].explanation).toContain("The note describes");
      expect(parsed[0].explanation).toContain("a location called The Homesteads");
    });

    it("does not escape newlines outside strings (valid JSON structure)", () => {
      const input = '{\n  "key": "value"\n}';
      const result = repairUnescapedQuotes(input);
      expect(result).toBe(input);
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });
});
