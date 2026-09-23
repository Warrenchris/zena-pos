# Phase 6B-06 — Operational Reliability, AI Cache Hardening, Distributed Rate Limiting & Observability Walkthrough

## 1. Audit Baseline

Prior to Phase 6B-06, Zana POS had achieved functional robustness across financial, POS idempotency, and tenant isolation layers (Phases 6A through 6B-05). However, operational audit findings revealed vulnerabilities when scaling horizontally across multiple replicas and handling adversarial inputs:

* `AI-01`: AI forecast cache in `aiProxy.js` relied on process-local `NodeCache`. Cache invalidation did not propagate between replicas, leading to stale forecasts surviving across horizontal deployments.
* `RATE-01`: AI and authentication rate limiters used process-local memory stores, allowing malicious actors to multiply rate limits by rotating requests across replicas.
* **AI Upstream Topology Leak**: Unhandled upstream AI proxy errors exposed internal container URLs (`AI_SERVICE_URL`, e.g., `http://zana-ai-service:8000`), internal ports, and Axios stack traces.
* **XLSX Supply Chain Vulnerability**: Untrusted product spreadsheet uploads used vulnerable `xlsx` via `XLSX.readFile(filePath)`, exposing the server to prototype pollution, ReDoS, and memory corruption.
* **Python AI Dependency Hygiene**: `sqlalchemy` was declared in `ai_service/requirements.txt` and `pyproject.toml` despite never being imported or utilized.
* `OBS-01`: Incoming requests lacked end-to-end correlation identifiers (`X-Request-Id`). Application logs used unstructured `console.log` emojis and risked dumping full AI business data prompts and payment callback secrets.

---

## 2. AI Cache Architecture (AI-01)

The AI forecasting proxy was re-architected to use Redis as the authoritative distributed cache layer, retaining a short-lived process-local L1 cache (`NodeCache`) purely as an in-memory optimization.

* **Authoritative Distributed Store**: Redis stores serialized forecast results with a standard TTL of 3,600 seconds (1 hour).
* **Tenant & Shop Key Namespacing**: Cache keys enforce strict tenant boundaries:
  - Shop-scoped forecasts: `ai:forecast:org:{organizationId}:shop:{shopId}:{model}:{periods}:{dataHash}`
  - Org-scoped forecasts: `ai:forecast:org:{organizationId}:{model}:{periods}:{dataHash}`
  - Payload hashing (`dataHash`) uses MD5 over normalized time-series date/value points, ensuring identical input datasets hit the cache while variations generate unique keys.
* **L1 Read-Through Hydration**: On a Redis cache hit, the result is hydrated into local process memory with a 5-minute TTL to reduce Redis roundtrips during bursts.

---

## 3. Distributed Invalidation

Process-local invalidation was replaced by non-blocking, distributed invalidation routines in `src/services/aiCacheService.js`:

* **Cursor-Based Scanning**: Never uses blocking `KEYS *`. Uses Redis `SCAN` with cursor iteration (`COUNT 100`) matching `ai:forecast:org:{orgId}:shop:{shopId}:*` or `ai:forecast:org:{orgId}:*`.
* **Tenant Authorization Enforcement**: Invalidation endpoints (`DELETE /api/ai/cache/org/:organizationId` and `DELETE /api/ai/cache/:shopId`) require authenticated user context and strictly verify that the requester belongs to the target organization and shop before scanning or deleting keys. Cross-tenant invalidation attempts are rejected with `403 Forbidden`.
* **Post-Commit Mutation Invalidation**: Product catalogue changes, inventory adjustments, stock transfers, and sales/refunds trigger cache invalidation hooks (`invalidateShopProductCache` / `invalidateOrgProductCaches`) only after the database transaction has committed, ensuring stale forecast data is evicted upon underlying data changes.

---

## 4. Rate-Limiter Architecture (RATE-01)

A reusable, distributed rate limiting utility was implemented in `src/utils/distributedRateLimiter.js`:

* **Atomic Redis Lua Script**: Replaced race-prone `GET -> calculate -> SET` operations with an atomic Lua script:
  ```lua
  local key = KEYS[1]
  local limit = tonumber(ARGV[1])
  local windowSeconds = tonumber(ARGV[2])
  local current = redis.call('INCR', key)
  if current == 1 then
    redis.call('EXPIRE', key, windowSeconds)
  end
  local ttl = redis.call('TTL', key)
  return { current, ttl }
  ```
* **Namespace Isolation**:
  - AI requests: `ratelimit:ai:org:{orgId}` or `ratelimit:ai:ip:{ip}` (20 requests / 15 minutes)
  - Auth login & reset: `ratelimit:auth:{ip}:{email}` (10 attempts / 15 minutes)
  - Registration: `ratelimit:register:{ip}` (5 attempts / 1 hour)
  - General API: `ratelimit:general:{ip}` (500 requests / 15 minutes, skipped during automated testing)
* **Standard Headers**: Emits `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, and `Retry-After`.

---

## 5. Redis Failure Behavior

Operational resilience mandates that POS sales, inventory mutations, and customer checkouts must never fail due to Redis unavailability:

* **Rate Limiter Fail-Open**: If Redis drops offline or errors during execution, `distributedRateLimiter` falls back to an in-memory `localFallbackStore` (with periodic TTL pruning) and logs a throttled warning (maximum 1 warning every 30 seconds). Core retail operations proceed uninterrupted.
* **AI Cache Fail-Open**: If Redis is unreachable, `getForecast` logs a throttled debug warning and returns `null`. The request gracefully falls back to direct upstream AI compute.
* **Connection Re-establishment**: Cold-booted workers and test environments execute `waitForRedisReady(client, 500)` to allow the asynchronous connection handshake to settle before falling back, preventing split-brain counting during process boot.

---

## 6. XLSX Security Remediation

The vulnerable `xlsx` library was eliminated from backend runtime dependencies:

* **Replacement with ExcelJS**: Installed `exceljs` (`^4.4.0`) and completely removed `xlsx` from `backend/package.json`.
* **Safe Ingestion & Parsing**: `productController.importProducts` now streams uploaded workbooks via `workbook.xlsx.readFile(filePath)` or `workbook.csv.readFile(filePath)`.
* **File Validation**:
  - File extension is strictly validated against `.xlsx` and `.csv`.
  - Content parsing errors (e.g., malformed zip headers, corrupt streams, or non-spreadsheet binaries) are caught and converted to safe `400 Bad Request` messages (`"Failed to parse spreadsheet file: invalid or corrupted format."`).
* **Deterministic File Cleanup**: All temporary files generated during upload are cleaned up inside a `finally` block via `fs.unlinkSync(filePath)` to prevent disk exhaustion.

---

## 7. Python Dependency Cleanup

The AI forecasting microservice dependencies were sanitized:

* **Removal of Unused SQLAlchemy**: `sqlalchemy` was removed from both `ai_service/requirements.txt` and `ai_service/pyproject.toml`.
* **Container Health & Tests**: Verified `zana-ai-service` container health and test execution:
  - `docker exec zana-ai-service pytest tests/test_forecasting_rf.py`
  - Result: **12 passed, 12 total (100%)**.

---

## 8. Dependency Audit Results

Executed `npm audit --omit=dev` in `backend/` before and after remediation:

* **Before**: Reachable high-severity prototype pollution and ReDoS via `xlsx`.
* **After**: `xlsx` completely removed. 21 vulnerabilities remain (8 moderate, 13 high).
* **Rationale for Preserving Remaining Dependencies**:
  - `npm audit fix --force` would pull in breaking major versions:
    * `sequelize` v7 / breaking changes to models and dialects.
    * `nodemailer` v10 (breaking transport API changes).
  - Reachability analysis confirms remaining issues reside in legacy JSON casting (Sequelize), internal mail transport parsing (Nodemailer), and dev tooling utilities not directly exposed to unauthenticated external payloads.
  - No blind `--force` upgrades were performed, preserving absolute runtime stability.

---

## 9. Request Correlation (OBS-01)

Implemented lightweight end-to-end request tracing via `src/middleware/requestContext.js`:

* **Inbound Handling**: Accepts client-supplied `X-Request-Id` if valid (alphanumeric, dashes, underscores; $\le 64$ characters). Malformed or oversized headers are discarded and replaced with cryptographically secure UUID v4 tokens.
* **Context Attachment**: Attaches `req.requestId` to the Express request object.
* **Outbound Propagation**: Automatically attaches `X-Request-Id` to all HTTP response headers.

---

## 10. Logging & Business Data Privacy

Structured logging was hardened in `src/utils/logger.js` and `src/middleware/requestLogger.js`:

* **Structured JSON Context**: Production logs output structured JSON metadata containing `requestId`, `organizationId`, `shopId`, `route`, `method`, `statusCode`, and `durationMs`.
* **Credential Redaction**: Redacts sensitive fields (`password`, `token`, `authorization`, `creditCard`, `cvv`, `mpesaSecret`, `callbackToken`).
* **AI Payload Privacy**: Request logger explicitly suppresses raw time-series sales histories and prompt text on `/api/ai/*` routes, logging only metadata summaries (`{ isAiPayload: true, datesCount, valuesCount }`).

---

## 11. Error Handling

Centralized error handling was standardized in `src/middleware/errorHandler.js`:

* **Sanitized Error Responses**: Internal database table names, column structures, SQL syntax, and system filesystem paths are scrubbed from production responses using regex filtering.
* **Standard Envelope**: Errors flowing through the error middleware return:
  ```json
  {
    "success": false,
    "error": "Sanitized error message",
    "code": "MACHINE_READABLE_CODE",
    "requestId": "uuid"
  }
  ```
* **Consumer Compatibility**: Backward compatibility was preserved for legacy controller 404/403 responses expected by existing frontend clients and earlier test suites (`{ error: 'Sale not found' }`), while attaching correlation headers to every HTTP response.

---

## 12. Dedicated Test Suite

Created `backend/tests/phase6bOperationalReliability.test.js` covering:

1. **AI Distributed Cache**: Cache hit, miss, tenant key separation, shop key separation, cursor SCAN invalidation, cross-tenant 403 rejection, and internal upstream URL sanitization.
2. **Distributed Rate Limiting**: Limit quota enforcement (429), tenant isolation (Org A hitting limit does not block Org B), and fail-open local fallback during Redis outages.
3. **File Import Security**: Valid CSV import, valid XLSX import via ExcelJS, corrupted spreadsheet rejection (400), disallowed extension rejection (400), and tenant context scoping.
4. **Observability**: UUID generation, trusted client ID mirroring, oversized/malformed ID sanitization, response headers, and error response envelopes.

**Result**: **16 passed, 16 total (100%)**.

---

## 13. Regression Verification Results

### 1. Phase 6B-06 Dedicated Suite
* **Command**: `npx jest tests/phase6bOperationalReliability.test.js --forceExit`
* **Result**: **1 passed, 1 total suite; 16 passed, 16 total tests (100%)**

### 2. Full 18-Suite Backend Regression
* **Command**:
  ```bash
  npx jest tests/phase6bOperationalReliability.test.js tests/phase6bTenantOracleSecurity.test.js tests/phase6bDatabaseOptimization.test.js tests/phase6bPosIdempotency.test.js tests/phase6bAuthSessionSecurity.test.js tests/phase6bPaymentSecurity.test.js tests/phase6aReleaseBlockers.test.js tests/phase5SubscriptionLifecycle.test.js tests/billingEndpoints.test.js tests/billingRenewal.test.js tests/subphase6c.test.js tests/phase4ProductInventorySecurity.test.js tests/phase4TransferIdempotency.test.js tests/phase3UserTenantSecurity.test.js tests/phase1.test.js tests/phase2.test.js tests/mpesaSecurity.test.js tests/item1-token-purpose.test.js --runInBand --forceExit
  ```
* **Result**: **18 passed, 18 total test suites; 231 passed, 231 total tests (100%)**

### 3. Frontend Production Build
* **Command**: `npm run build`
* **Result**: **PASS (0 TypeScript/Vite errors, 2609 modules transformed)**

### 4. Python AI Service Tests
* **Command**: `docker exec zana-ai-service pytest tests/test_forecasting_rf.py`
* **Result**: **12 passed, 12 total (100%)**

### 5. Database Migration Hygiene
* **Command**: `npx sequelize-cli db:migrate:status`
* **Result**: **90 UP, 0 pending**

---

## 14. Remaining Risks

* **Spreadsheet Decompression Bombs**: While ExcelJS mitigates prototype pollution and memory corruption vulnerabilities present in `xlsx`, extremely large spreadsheets with millions of rows can still consume significant server memory. Upload payload size limits (currently 10MB) mitigate this.
* **Redis Memory Consumption**: Forecast caches use a 3600-second TTL. In multi-tenant environments with thousands of shops generating forecasts, Redis memory eviction policy should be set to `volatile-lru` or `allkeys-lru` to avoid OOM conditions.

---

## 15. Rollback Considerations

* **No Schema Migrations**: Phase 6B-06 introduced zero database migrations. Rollback requires only checking out the previous git commit (`f298dc9`).
* **Redis Key Isolation**: All Redis keys used by Phase 6B-06 use distinct namespaces (`ai:forecast:*`, `ratelimit:*`). In the event of a rollback, these keys can be cleared safely with `redis-cli del` without affecting session or permission caches.
