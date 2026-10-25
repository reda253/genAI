# Meterless Engine Conformance Tests
## Ledger Lens · Open Agent Hackathon 2026

Evidence of conformance tests passing for all three Meterless reference engines integrated into the Ledger Lens backend.

---

## 1. World Model Conformance & Smoke Tests — Sat Oct 24, 2026

```
> vitest run test/engines/world-model/

 RUN  v2.1.9 C:/Users/ctaha/Desktop/genAI/backend

 ✓ test/engines/world-model/smoke.test.ts (10 tests) 39ms
   ✓ entity upsert and retrieval
   ✓ facts assertion and query
   ✓ relationships between entities (graph view)
   ✓ temporal tracking & point-in-time view
   ✓ snapshot export and import
   ✓ externalKey namespace lookups
   ✓ observation ingestion and fact extraction
   ✓ merge conflicts resolution
   ✓ stable IDs generation
   ✓ confidence scoring and decay

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Duration  844ms
```

---

## 2. H-MEM (Hierarchical Memory) Conformance & Smoke Tests — Sat Oct 24, 2026

```
> vitest run test/engines/hmem/

 RUN  v2.1.9 C:/Users/ctaha/Desktop/genAI/backend

 ✓ test/engines/hmem/smoke.test.ts (10 tests) 20ms
   ✓ add memory and retrieve by id
   ✓ query memories with semantic threshold
   ✓ update memory content and confidence
   ✓ memory decay across time
   ✓ tagging and category filtering
   ✓ sleep cycle consolidation
   ✓ dreaming / associative memory retrieval
   ✓ conflict detection between memories
   ✓ trust ledger update and verification
   ✓ export and restore memory store

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Duration  804ms
```

---

## 3. Markovian Conformance & Smoke Tests — Sat Oct 24, 2026

```
> vitest run test/engines/markovian/

 RUN  v2.1.9 C:/Users/ctaha/Desktop/genAI/backend

 ✓ test/engines/markovian/smoke.test.ts (10 tests) 16ms
   ✓ chunk configuration and initialization
   ✓ step execution with bounded limits
   ✓ carryover state between chunks
   ✓ progress markers and token accounting
   ✓ prompt building with prior chunk context
   ✓ compressor function invocation
   ✓ reflection loop evaluation
   ✓ history tracking across steps
   ✓ error handling on generator timeout
   ✓ final synthesis output generation

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Duration  793ms
```

---

## 4. Meterless Domain Adapters & Live Memory Moment — Sun Oct 25, 2026

```
> vitest run test/engines/

 RUN  v2.1.9 C:/Users/ctaha/Desktop/genAI/backend

 ✓ test/engines/world-model/smoke.test.ts (10 tests) 60ms
 ✓ test/engines/entity360.test.ts (4 tests) 52ms
 ✓ test/engines/markovian/smoke.test.ts (10 tests) 24ms
 ✓ test/engines/hmem/smoke.test.ts (10 tests) 28ms
 ✓ test/engines/adapters.test.ts (6 tests) 46ms
 ✓ test/engines/memoryMoment.test.ts (1 test) 497ms
   ✓ Demo Memory Moment (H-MEM + World Model live integration) > rejecting a move persists in H-MEM and modifies subsequent CFO brief rankings and memory_notes 496ms
 ✓ test/engines/memoryPersistence.test.ts (3 tests) 658ms
   ✓ H-MEM Memory Persistence & Endpoints (Task I4) > GET /api/memories works without any run and returns [] initially 385ms
   ✓ H-MEM Memory Persistence & Endpoints (Task I4) > stores decisions, lists them newest first, persists to disk, and allows deleting them
   ✓ H-MEM Memory Persistence & Endpoints (Task I4) > deleting a memory restores original ranking logic without that memory's penalty

 Test Files  7 passed (7)
      Tests  44 passed (44)
   Duration  2.42s
```

---

## 5. H-MEM Memory Persistence & Endpoints (Task I4)

- Configurable persistence directory via `createEngines(llm, { persistDir: 'logs/hmem' })`.
- Safely recovers across application / container restarts.
- Endpoints: `GET /api/memories` (returns list newest first) and `DELETE /api/memories/:id` (204 on success, 404 if not found).
- Removing a memory restores normal move ranking without the penalty.

---

## 6. World Model Client & Vendor 360 (Task I3)

- Bitemporal graph & fact store indexed with full Zetaris view rows (`client_profitability`, `subscription_usage`, `ar_aging`, `findings`).
- Endpoint: `GET /api/entities/:id` (e.g. `c01`, `sub02`).
- Returns contract-compliant Entity 360 profile: `id`, `kind` (`client` | `subscription`), `name`, `summary`, `facts`, `findings`, `invoices`.

