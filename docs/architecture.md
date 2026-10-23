# Architecture

Postgres + REST source → Zetaris (4 views) → backend agents (Leak Hunter, Explainer, Forecaster, CFO) using Meterless engines (World Model, H-MEM, Markovian) → Nightshift → Nemotron → React dashboard, where the user approves or rejects each move.

_TODO: diagram and data flow (P1). See [plan.md](plan.md) for now._
