# PRD-033: Claude AI Provider JSON Parsing Robustness

## Status
**Completed** (Updated: Added unescaped quote repair, literal newline escaping)

## Problem Statement

When importing notes via the Nuclino import with AI Enhance feature, the Claude API responses were failing to parse with three distinct error types observed in the dev server logs:

```
Failed to parse classification response: SyntaxError: Expected ',' or '}' after property value in JSON at position 1117 (line 37 column 47)
    at JSON.parse (<anonymous>)
    at ClaudeAIProvider.parseClassificationResponse (C:\Projects\Helm\server\ai\claude-provider.ts:140:27)

Failed to parse classification response: SyntaxError: Unexpected token 'H', "Here is th"... is not valid JSON
    at JSON.parse (<anonymous>)
    at ClaudeAIProvider.parseClassificationResponse (C:\Projects\Helm\server\ai\claude-provider.ts:140:27)

Failed to parse classification response: SyntaxError: Expected ',' or '}' after property value in JSON at position 2452 (line 94 column 62)
    at JSON.parse (<anonymous>)
    at ClaudeAIProvider.parseClassificationResponse (C:\Projects\Helm\server\ai\claude-provider.ts:140:27)
```

## Root Cause Analysis

### Investigation Findings

1. **Three identical vulnerable patterns** existed in the codebase:
   - `parseClassificationResponse` (line 140)
   - `parseRelationshipResponse` (line 279)
   - `parseEntityExtractionResponse` (line 450)

2. **Brittle JSON extraction logic**:
   ```typescript
   let jsonStr = textBlock.text.trim();
   const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
   if (jsonMatch) {
     jsonStr = jsonMatch[1].trim();
   }
   const parsed = JSON.parse(jsonStr);  // Fails here
   ```

3. **No shared utility** existed for LLM JSON extraction - each method reinvented the same pattern.

4. **Error handling existed but lost context** - didn't log what was being parsed, making debugging difficult.

### Failure Scenarios Identified

| Scenario | Example | Issue |
|----------|---------|-------|
| Text preambles | `"Here is the JSON response:" [...]` | No code block, raw JSON with leading text |
| Malformed JSON | `{"key": "value",}` | Trailing commas from LLM |
| Missing commas | `"a": 1\n"b": 2` | LLM omits commas between properties |
| Raw JSON | `[{"id": "1"}]` | Valid JSON but no markdown wrapping |

## Implementation

### Solution Overview

Added two helper methods to `ClaudeAIProvider`:

1. **`extractJsonFromResponse(text: string): string`** - Robust JSON extraction that:
   - First tries markdown code block extraction (`/```(?:json)?\s*([\s\S]*?)```/`)
   - Falls back to finding JSON array/object boundaries with text preambles
   - Properly handles nested brackets and strings with escaped characters

2. **`repairJson(jsonStr: string): string`** - Fixes common LLM JSON errors:
   - Removes trailing commas before closing brackets
   - Adds missing commas between properties on newlines

### Files Modified

| File | Changes |
|------|---------|
| `server/ai/claude-provider.ts` | Added `extractJsonFromResponse()`, `repairJson()`, updated 3 parsing methods, added debug logging |
| `server/ai/claude-provider.test.ts` | New file with 21 unit tests |

### Code Changes

**New helper: `extractJsonFromResponse`** (lines 346-403)
- Strategy 1: Extract from markdown code block
- Strategy 2: Find JSON boundaries even with preamble text
- Handles nested brackets by tracking depth
- Handles strings with brackets inside by tracking quote state
- Handles escaped characters

**New helper: `repairJson`** (lines 408-419)
- Removes trailing commas: `,}` -> `}`
- Adds missing commas between newline-separated properties

**Updated parsing methods** to use two-phase parsing:
```typescript
let jsonStr = this.extractJsonFromResponse(rawText);

try {
  parsed = JSON.parse(jsonStr);
} catch {
  const repaired = this.repairJson(jsonStr);
  parsed = JSON.parse(repaired);
}
```

**Added debug logging** on parse failures:
```typescript
console.error("Raw response text (first 500 chars):", rawText.slice(0, 500));
```

## Testing

### Unit Tests Added

| Test Suite | Tests | Coverage |
|------------|-------|----------|
| `extractJsonFromResponse` | 12 tests | Code blocks, preambles, nesting, escaping |
| `repairJson` | 7 tests | Trailing commas, missing commas, valid JSON |
| Combined scenarios | 2 tests | End-to-end extraction + repair |

### Test Results (Original Implementation)

```
✓ server/ai/claude-provider.test.ts (21 tests) 6ms
Test Files  1 passed (1)
Tests       21 passed (21)
```

Full test suite: **495 tests passed** (no regressions)

> **Note**: After follow-up fixes, the test file now contains **48 tests** and the full suite has **526 tests**.

## Acceptance Criteria

- [x] JSON extraction handles text preambles like "Here is the..."
- [x] JSON extraction handles markdown code blocks
- [x] JSON repair fixes trailing commas
- [x] All three parsing methods use the robust extraction
- [x] Parsing errors include debug context (first 500 chars of response)
- [x] Existing tests pass
- [x] New unit tests for JSON extraction utilities

## Verification

To manually verify the fix:
1. Start the dev server: `npm run dev`
2. Navigate to a team's Notes page
3. Click Import and select a Nuclino zip file
4. Enable "AI Enhance Import" toggle
5. Confirm import completes without JSON parsing errors in console
6. Verify classifications are applied to imported notes

---

## Follow-up Issue: Unescaped Quotes in String Values

### Problem Statement (January 2026)

Despite the original fix, a new parsing failure was observed:

```
Failed to parse classification response: SyntaxError: Expected ',' or '}' after property value in JSON at position 2089 (line 65 column 107)
    at JSON.parse (<anonymous>)
    at ClaudeAIProvider.parseClassificationResponse (C:\Projects\Helm\server\ai\claude-provider.ts:152:23)
```

Raw response showed the LLM was generating embedded quotes inside string values:

```json
{
  "explanation": "The content describes a location called "The Homesteads" which contains..."
}
```

### Root Cause

The original `repairJson()` method only handled:
1. Trailing commas (`,}` → `}`)
2. Missing commas between newline-separated properties

It did NOT handle **unescaped quotes inside string values**, which is a common LLM output pattern when describing entities with quoted names.

### Solution

Added a new `repairUnescapedQuotes()` method that uses contextual heuristics to distinguish:
- **Structural quotes**: JSON string delimiters (preceded by `{[,:` or followed by `}]:,`)
- **Embedded quotes**: Content inside strings that should be escaped

**Algorithm**: Walk through the JSON character by character:
1. Track `inString` state based on structural quote positions
2. When inside a string, if a quote is NOT followed by a structural character, escape it
3. Preserve already-escaped quotes (`\"`)

### Implementation Details

| Method | Purpose |
|--------|---------|
| `repairUnescapedQuotes()` | Main repair logic using state machine (lines 449-510) |
| `getFollowingNonWhitespace()` | Find context character after a quote (lines 515-520) |
| `isValidStringCloser()` | Check if position is valid for closing a string (lines 525-528) |

**Integration**: `repairUnescapedQuotes()` is called **first** in `repairJson()` before other repairs, since trailing comma and missing comma repairs assume valid string boundaries.

### Files Modified

| File | Changes |
|------|---------|
| `server/ai/claude-provider.ts` | Added `repairUnescapedQuotes()`, `getFollowingNonWhitespace()`, `isValidStringCloser()`, updated `repairJson()` |
| `server/ai/claude-provider.test.ts` | Added 14 new tests for unescaped quote scenarios |

### New Test Coverage

| Test | Description |
|------|-------------|
| `escapes embedded quotes in string values` | Basic case: `"the "Blacksmith" guild"` |
| `handles multiple embedded quote pairs` | `"The "quick" and "slow" fox"` |
| `preserves already escaped quotes` | `"He said \"hello\""` unchanged |
| `handles nested objects with embedded quotes` | Nested JSON structures |
| `handles arrays with embedded quotes` | Array elements with quotes |
| `handles realistic classification response` | Real-world LLM output pattern |
| `handles mixed escaped and unescaped quotes` | Both types in same string |
| `repairs both embedded quotes and trailing commas` | Combined repair scenarios |

### Acceptance Criteria

- [x] Unescaped quotes inside string values are properly escaped
- [x] Already-escaped quotes (`\"`) are preserved
- [x] Structural quotes (JSON delimiters) are not modified
- [x] Nested objects and arrays handled correctly
- [x] Integration with existing `repairJson()` flow
- [x] 14 new unit tests added and passing
- [x] All existing 21 tests still passing

---

## Follow-up Issue #2: Literal Newlines in String Values

### Problem Statement (January 2026)

Despite fixing unescaped quotes, another parsing failure was observed:

```
Failed to parse classification response: SyntaxError: Expected double-quoted property name in JSON at position 2381 (line 74 column 63)
    at JSON.parse (<anonymous>)
    at ClaudeAIProvider.parseClassificationResponse (C:\Projects\Helm\server\ai\claude-provider.ts:152:23)
```

The raw response showed the LLM was generating literal newlines inside string values:

```json
{
  "explanation": "The note describes
a location called The Homesteads..."
}
```

### Root Cause

JSON does not allow literal newline, carriage return, or tab characters inside string values. They must be escaped as `\n`, `\r`, and `\t` respectively.

The existing `repairUnescapedQuotes()` method only handled:
1. Already-escaped sequences (passed through unchanged)
2. Embedded quotes (escaped when not followed by structural characters)

It did NOT handle **literal control characters** inside string values.

### Solution

Extended `repairUnescapedQuotes()` to also escape literal control characters when inside a JSON string:

- `\n` (newline) → `\\n`
- `\r` (carriage return) → `\\r`
- `\t` (tab) → `\\t`

**Key implementation detail**: The control character escaping only applies when `inString` is true, so structural newlines in formatted JSON (between properties) are preserved.

### Implementation Details

Added to `repairUnescapedQuotes()` (lines 464-482) after the escaped character handling:

```typescript
// PRD-033: Escape literal control characters inside strings
// JSON doesn't allow raw newlines, tabs, or carriage returns in string values
if (inString) {
  if (char === '\n') {
    result.push('\\n');
    i++;
    continue;
  }
  if (char === '\r') {
    result.push('\\r');
    i++;
    continue;
  }
  if (char === '\t') {
    result.push('\\t');
    i++;
    continue;
  }
}
```

### Files Modified

| File | Changes |
|------|---------|
| `server/ai/claude-provider.ts` | Extended `repairUnescapedQuotes()` to escape literal control characters (lines 464-482) |
| `server/ai/claude-provider.test.ts` | Added 14 new tests (8 unit + 4 integration + 2 e2e) |
| `docs/prd/PRD-033-claude-provider-json-parsing-robustness.md` | Added Follow-up Issue #2 documentation |

### New Test Coverage

**Unit tests** (8 tests for `repairUnescapedQuotes`):
| Test | Description |
|------|-------------|
| `escapes literal newline inside string value` | `"line one\nline two"` → parseable JSON |
| `escapes literal carriage return inside string value` | `"line one\rline two"` → parseable JSON |
| `escapes literal tab inside string value` | `"col1\tcol2"` → parseable JSON |
| `preserves already-escaped newlines` | `"line one\\nline two"` unchanged |
| `handles mix of embedded quotes and literal newlines` | Combined fix scenarios |
| `handles multiple literal newlines in one string` | `"line1\nline2\nline3"` |
| `handles realistic LLM response with literal newline` | Real-world failure case |
| `does not escape newlines outside strings` | Formatted JSON structure preserved |

**Integration tests** (4 tests for `repairJson` pipeline):
| Test | Description |
|------|-------------|
| `repairs literal newlines through repairJson` | Full repair pipeline |
| `repairs literal newlines combined with trailing commas` | Multiple repairs together |
| `repairs literal newlines combined with embedded quotes` | Quote + newline combined |
| `repairs real-world LLM classification response` | Simulates actual error scenario |

**End-to-end tests** (2 tests for extraction + repair):
| Test | Description |
|------|-------------|
| `handles code block extraction followed by newline repair` | Code block → repair → valid JSON |
| `handles preamble extraction followed by newline repair` | Preamble text → repair → valid JSON |

### Acceptance Criteria

- [x] Literal newlines inside string values are properly escaped
- [x] Literal carriage returns inside string values are properly escaped
- [x] Literal tabs inside string values are properly escaped
- [x] Already-escaped sequences (`\\n`) are preserved
- [x] Newlines outside strings (JSON formatting) are not modified
- [x] 14 new tests added and passing (8 unit + 4 integration + 2 e2e)
- [x] All existing 34 tests still passing (48 total)
