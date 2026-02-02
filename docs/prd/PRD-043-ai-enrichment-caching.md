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

Cache lookup happens in both the enrichment worker and the AI preview endpoint:
1. Check cache for all notes before calling AI provider
2. Only send uncached notes to AI
3. Store fresh results in cache (awaited to ensure persistence)
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
| `server/jobs/enrichment-worker.ts` | Integrated cache lookup/storage into classification and relationship flows |
| `server/routes.ts` | Integrated cache lookup/storage into AI preview endpoint (`/ai-preview`) for both classification and relationships |
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

- Cache integration happens at both enrichment worker and AI preview endpoint levels
- Content hashing uses SHA-256 with normalization for consistency
- PC names affect Character vs NPC classification, so they're included in context hash
- Relationship cache uses order-independent pair hash so A→B and B→A hit same entry
- Cache miss for expired entries happens at lookup time (no background cleanup required)
- Hit count and lastHitAt updated on cache hits for analytics
- Test coverage: 22 unit tests covering key generation, cache operations, and invalidation

### Bug Fix: AI Preview Cache Integration (2026-01-19)

**Issue**: Cache was not being used when users generated AI previews during import. Clicking Cancel and re-importing showed no cache benefit.

**Root Cause**: The `/api/teams/:teamId/imports/nuclino/ai-preview` endpoint called `provider.classifyNotes()` directly without using the AI cache. Cache integration only existed in the enrichment worker (a different code path).

**Fix**: Added `classifyNotesWithCacheForPreview()` helper function in `server/routes.ts` that:
1. Checks cache for all notes before calling AI
2. Only sends uncached notes to the AI provider
3. Awaits all cache writes using `Promise.all()` (ensures persistence before returning)
4. Adjusts progress callbacks to account for cached items

**Verification**: Server logs show "AI Preview Cache: N/N classification cache hits" on re-imports.

### Enhancement: Relationship Caching (2026-01-19)

**Issue**: Relationship extraction was not cached in either the AI preview endpoint or the enrichment worker.

**Fix**: Added relationship caching to both code paths:

1. **AI Preview Endpoint** (`server/routes.ts`):
   - Added `extractRelationshipsWithCacheForPreview()` helper function
   - Checks cache for all note pairs before calling AI
   - Only sends notes with uncached pairs to the AI provider
   - Stores fresh relationship results per-pair in cache

2. **Enrichment Worker** (`server/jobs/enrichment-worker.ts`):
   - Added `extractRelationshipsWithCache()` function
   - Same caching pattern as the AI preview endpoint
   - Also fixed fire-and-forget issue in `classifyNotesWithCache()` - now uses `Promise.all()` to await cache writes

**How Relationship Caching Works**:
- For each unique pair of notes, check if we have a cached relationship
- If any pairs are uncached, send those notes to the AI for analysis
- Cache results per-pair using order-independent hash (A→B and B→A hit same cache entry)
- Merge cached and fresh results, deduplicating by pair

**Verification**: Server logs show "AI Cache: N relationship cache hits" on re-imports.

### Bug Fix: Relationship Negative Caching (2026-01-19)

**Issue**: Second import still showed many relationship cache misses. With 92 notes (~4186 possible pairs), only ~145 cache hits were occurring on re-import instead of the expected ~4186.

**Root Cause**: Relationship caching only stored pairs WHERE relationships were found (~100-200 pairs). Pairs analyzed but having NO relationship were never cached, causing them to be re-analyzed every time.

**Fix**: Added "negative caching" - store markers for pairs that were analyzed but had no relationship:

1. **Schema Changes** (`shared/schema.ts`):
   - Added `"None"` to `RELATIONSHIP_TYPES` array
   - Added `"Analyzed"` to `EVIDENCE_TYPES` array

2. **Cache All Analyzed Pairs** (`server/routes.ts` and `server/jobs/enrichment-worker.ts`):
   - After AI returns results, track which pairs had relationships found
   - For pairs WITHOUT relationships, cache a "no relationship" marker:
     ```typescript
     {
       relationshipType: "None",
       confidence: 1.0,
       evidenceSnippet: "",
       evidenceType: "Analyzed",
     }
     ```
   - On cache lookup, "None" results mean "already analyzed, no relationship exists" → skip this pair

**Verification**: Second import should now show:
```
AI Preview Cache: 4186/4186 relationship cache hits (0 pairs need analysis)
```

Server logs show both positive relationships and "no-relationship markers" being cached:
```
AI Cache: Wrote 87 relationships + 3973 no-relationship markers to cache
```
