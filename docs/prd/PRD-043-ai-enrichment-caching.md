# PRD-043: AI Enrichment Result Caching

## Status
Done

## Problem Statement

When importing notes via the Nuclino import flow, AI enrichment operations (classification and relationship extraction) make API calls to Claude Haiku for every note processed. If a user re-imports the same content, or imports similar content across multiple teams, the same AI operations are repeated unnecessarily, incurring redundant API costs.

Additionally, when bug fixes or optimizations improve the AI enrichment prompts, there's no mechanism to identify that cached results are stale and should be regenerated with the improved algorithm.

### Current Cost Profile
- **Classification**: ~20 API calls per 100 notes (10 notes/batch)
- **Relationship Extraction**: ~20 API calls per 100 notes
- **Total**: ~40 API calls per 100-note import, scaling linearly

### Cost Savings Opportunity
- Re-imports of unchanged content: 100% savings
- Partial re-imports: Proportional savings for unchanged notes

## Goals

1. **Reduce API costs** by caching AI classification and relationship results
2. **Automatic invalidation** when AI algorithm/prompt improves (version-based)
3. **Content-aware caching** - only cache hits when input content is identical
4. **Transparency** - provide visibility into cache hit rates and cost savings
5. **Zero user friction** - caching should be invisible to end users

## Non-Goals

- Real-time cache for entity detection (client-side pattern matching)
- Caching for live session log entity extraction (context-dependent)
- Distributed cache (Redis, etc.) - in-process + database is sufficient for current scale
- User-facing cache settings or statistics (developer/internal tooling only)
- Global cross-team cache sharing (team isolation is required)

---

## Technical Design

### 1. Database Schema Changes

#### New Table: `ai_cache_entries`

Stores cached AI classification and relationship results with:
- Cache key components: cacheType, contentHash, algorithmVersion, contextHash
- Team-scoped isolation: teamId (required)
- Cached result as JSON
- Metadata: modelId, hitCount, timestamps

#### New Table: `ai_algorithm_versions`

Tracks prompt/algorithm versions for cache invalidation.

### 2. Algorithm Version Tracking

Version constants in `server/ai/cache-versions.ts`:
- Current version for each operation type
- History with descriptions
- Version bump invalidates old cache entries automatically

### 3. Cache Key Generation

- **Classification**: SHA-256(normalized title + content) + SHA-256(sorted PC names)
- **Relationship**: Order-independent pair hash of both notes

Content normalization:
- Trim, lowercase, collapse whitespace
- Remove markdown formatting characters
- Limit to 2000 chars (matches classification truncation)

### 4. Cache Integration

Cache lookup happens in the enrichment worker:
1. Check cache for all notes before calling AI provider
2. Only send uncached notes to AI
3. Store fresh results in cache
4. Merge cached and fresh results

---

## Files Modified

| File | Changes |
|------|---------|
| `shared/schema.ts` | Added `aiCacheEntries` and `aiAlgorithmVersions` tables, types, and insert schemas |
| `server/storage.ts` | Added IStorage cache methods and DatabaseStorage implementation |
| `server/test/memory-storage.ts` | Added MemoryStorage cache implementation for testing |
| `server/ai/cache-versions.ts` | **New file** - Algorithm version tracking constants |
| `server/ai/ai-cache.ts` | **New file** - Cache service with key generation and operations |
| `server/jobs/enrichment-worker.ts` | Integrated cache lookup/storage into classification flow |
| `scripts/ai-cache-admin.ts` | **New file** - CLI tool for cache administration (stats, prune, invalidate) |
| `server/ai/ai-cache.test.ts` | **New file** - Unit tests for cache system (22 tests) |

---

## Acceptance Criteria

1. **Cache Hits**: When re-importing identical note content, AI API calls are skipped and cached results are used
2. **Cache Misses on Content Change**: When note content differs (even whitespace-normalized), a new API call is made
3. **Version Invalidation**: When `AI_ALGORITHM_VERSIONS` is bumped, old cache entries are automatically bypassed
4. **Cache Statistics**: Developers can view cache hit rates and estimated token savings via internal API
5. **No User Impact**: Caching is transparent - users see same results whether cached or fresh
6. **Test Coverage**: Unit tests for cache key generation, integration tests for end-to-end flow

---

## Cache Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| Default TTL | 30 days | Balance between cost savings and prompt freshness |
| Cleanup Interval | Daily (cron) | Prune expired entries |
| Team Scope | Required | All cache entries are team-scoped for complete data isolation |
| Hit Count Tracking | Yes | Internal analytics for monitoring cache effectiveness |
| Access Control | CLI script only | Cache management runs directly against DB, NOT exposed over HTTP |

---

## CLI Administration Tool

Cache management is handled via a CLI script that runs directly against the database. This approach was chosen for security reasons since the app will be published to the app store.

**Location**: `scripts/ai-cache-admin.ts`

**Usage**:
```bash
npx tsx scripts/ai-cache-admin.ts stats                              # Show cache statistics
npx tsx scripts/ai-cache-admin.ts prune-expired                      # Delete expired entries
npx tsx scripts/ai-cache-admin.ts invalidate-version classification 1.0.0  # Invalidate by version
npx tsx scripts/ai-cache-admin.ts invalidate-team <team-id>          # Invalidate by team
```

---

## Implementation Notes

- Cache integration happens at enrichment worker level, not inside ClaudeAIProvider
- Content hashing uses SHA-256 with normalization for consistency
- PC names affect Character vs NPC classification, so they're included in context hash
- Relationship cache uses order-independent pair hash so A→B and B→A hit same entry
- Cache miss for expired entries happens at lookup time (no background cleanup required)
- Hit count and lastHitAt updated on cache hits for analytics
- Test coverage: 22 unit tests covering key generation, cache operations, and invalidation
