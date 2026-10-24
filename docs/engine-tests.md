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

## 4. Meterless Domain Adapters & Live Memory Moment — Sat Oct 24, 2026

```
> vitest run test/engines/

 RUN  v2.1.9 C:/Users/ctaha/Desktop/genAI/backend

 ✓ test/engines/world-model/smoke.test.ts (10 tests) 44ms
 ✓ test/engines/markovian/smoke.test.ts (10 tests) 21ms
 ✓ test/engines/hmem/smoke.test.ts (10 tests) 27ms
 ✓ test/engines/adapters.test.ts (3 tests) 28ms
   ✓ World Model: ingests Zetaris views and retrieves rich entity context
   ✓ H-MEM: stores decisions and adapts move ranking based on past user memory
   ✓ Markovian: runs chunked hypothesis investigation with carryover
 ✓ test/engines/memoryMoment.test.ts (1 test) 373ms
   ✓ Demo Memory Moment (H-MEM + World Model live integration) > rejecting a move persists in H-MEM and modifies subsequent CFO brief rankings and memory_notes 371ms

 Test Files  5 passed (5)
      Tests  34 passed (34)
   Duration  1.65s
```
