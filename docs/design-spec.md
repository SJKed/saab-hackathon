# Adaptive Air Defense Prototype

## 1. Purpose
This document defines the implementation design and functional specification for a configurable command decision support prototype.

The system includes two adaptive policies over a shared simulation state:
- Enemy policy: exploits weakly defended sectors and maximizes strategic damage.
- Helper policy: recommends defensive actions to maximize long-term survivability and readiness.

This document is written for rapid implementation before hackathon day while preserving flexibility for last-minute rule changes.

## 2. Product Goals
### 2.1 Primary Goal
Enable an operator to make better defense allocation decisions under time pressure by accepting or rejecting ranked recommendations.

### 2.2 Secondary Goals
- Demonstrate adaptation to changing constraints without code rewrites.
- Show measurable improvement against a simple baseline policy.
- Provide transparent explanation of recommendations.

### 2.3 Out of Scope (Milestone 1)
- Multiplayer operations.
- High-fidelity radar/physics modeling.
- Integration with external real-time data feeds.

## 3. System Overview
### 3.1 High-Level Components
- Config and scenario layer.
- Core simulation engine.
- Enemy decision policy.
- Helper recommendation policy.
- Operator UI and explainability panel.
- Replay and KPI evaluation tools.

### 3.2 Decision Loop
1. Load scenario and initialize world state.
2. Advance simulation tick.
3. Detect threats and derive actionable candidates.
4. Enemy policy selects offensive actions.
5. Helper policy generates ranked defensive recommendations.
6. Operator accepts or rejects recommendation.
7. Apply actions and resolve outcomes.
8. Log events and KPIs.
9. Repeat until scenario end condition.

## 4. Core Domain Model
### 4.1 ResponseEntity
Represents a deployable defensive unit (fighter, missile battery, drone, etc).

Required fields:
- id: string
- name: string
- category: "fighter" | "sam_battery" | "drone" | "interceptor" | "other"
- domain: "air" | "ground" | "sea" | "multi"
- homeLocationId: string
- currentLocation: { xKm: number, yKm: number }
- status: "ready" | "deployed" | "damaged" | "repairing" | "rearming" | "unavailable"
- readiness: number (0 to 1)
- health: number (0 to 1)
- speedKmh: number
- maxRangeKm: number
- reactionTimeSec: number
- ammoCapacity: number
- ammoRemaining: number
- reloadTimeSec: number
- repairRatePerMin: number
- maneuverability: number (0 to 1)
- attackProfile: Record<threatType, number>
- defenseProfile: Record<threatType, number>
- cooldownSec: number

Optional fields:
- enduranceMin: number
- sensorRangeKm: number
- survivability: number
- deploymentCost: number
- constraints: string[]

### 4.2 DefensibleEntity
Represents a protected strategic location (base, capital, city).

Required fields:
- id: string
- name: string
- category: "air_base" | "capital" | "city" | "infrastructure" | "other"
- side: "north" | "south" | "neutral"
- location: { xKm: number, yKm: number }
- criticalityWeight: number
- enemyPriorityWeight: number
- vulnerability: number (0 to 1)
- resilience: number (0 to 1)
- maxHealth: number
- currentHealth: number
- protectionRadiusKm: number

Optional fields:
- civilianRiskWeight: number
- downtimeImpactPerMin: number
- tags: string[]

### 4.3 ThreatEntity
Represents an offensive object or attack package.

Required fields:
- id: string
- type: string
- origin: { xKm: number, yKm: number }
- targetEntityId: string
- currentLocation: { xKm: number, yKm: number }
- speedKmh: number
- etaSec: number
- lethality: number
- evasion: number
- health: number
- status: "active" | "intercepted" | "impact" | "lost"

### 4.4 Assignment
Represents relationship between defensible entities and available response assets.

Required fields:
- defensibleEntityId: string
- responseEntityId: string
- assignmentType: "primary" | "reserve" | "shared"
- lockState: "movable" | "pinned"
- priorityOrder: number

### 4.5 WorldState
- tick: number
- timeSec: number
- responseEntities: ResponseEntity[]
- defensibleEntities: DefensibleEntity[]
- threats: ThreatEntity[]
- assignments: Assignment[]
- activeConstraints: Constraint[]
- kpiSnapshot: KpiSnapshot

## 5. Objectives and Optimization
### 5.1 Shared Structure
Both policies use the same features but opposite objectives.

### 5.2 Helper Objective
Maximize weighted survival and future readiness:

J_helper = sum_t (a * assetSurvival_t - b * expectedDamage_t - c * depletion_t + d * futureCoverage_t)

### 5.3 Enemy Objective
Maximize expected strategic damage and exploit defense imbalance:

J_enemy = sum_t (e * expectedDamage_t + f * criticalAssetExposure_t + g * forcedOvercommitment_t)

### 5.4 Constraints
- Range and kinematics.
- Readiness and cooldown.
- Ammo and reload availability.
- Assignment lock rules.
- Scenario restrictions (for example no-fly zones).
- Solve-time budget per tick.

### 5.5 Fallback Logic
If optimizer fails feasibility or time budget:
- Use greedy heuristic by urgency and criticality.
- Emit degraded confidence level and reason code.

## 6. Simulation Rules
### 6.1 Tick Granularity
Default tick: 15 seconds.

### 6.2 Resolution Order Per Tick
1. Spawn/update threats.
2. Update movement.
3. Run enemy policy.
4. Run helper policy and generate ranked options.
5. Apply operator decision.
6. Resolve engagements and damage.
7. Update cooldown, reload, repair.
8. Update KPIs and event log.

### 6.3 Determinism
- All stochastic events must use seeded RNG.
- Same seed and decisions must produce same outcome.

## 7. API Contract (MVP)
### 7.1 Endpoints
- POST /api/scenario/load
- POST /api/sim/reset
- POST /api/sim/step
- GET /api/state
- GET /api/recommendations
- POST /api/recommendations/{id}/accept
- POST /api/recommendations/{id}/reject
- GET /api/kpis
- GET /api/events

### 7.2 Response Times
- Recommendation generation target: <= 500 ms per tick for MVP scenario sizes.

## 7.3 Non-Functional Requirements
- Policy solve budget: <= 500 ms p95 per tick for MVP scenarios.
- Tick processing budget (end-to-end backend): <= 1000 ms p95.
- UI refresh cadence: 1 update per tick with visual confirmation within 250 ms after backend response.
- Determinism: same scenario + seed + decisions must produce byte-stable event order and KPI outputs.
- Reliability: scenario load failures must return structured error codes and field-level diagnostics.
- Observability: each tick must log policy duration, fallback usage, and action count.

## 8. UI Specification
### 8.1 Screens
- Map and tactical state screen.
- Recommendation panel with ranked options.
- KPI and timeline panel.

### 8.2 Recommendation Card Content
- Action summary.
- Impact now (intercept probability, response time).
- Impact later (coverage, reserve effect).
- Confidence and reason codes.
- Accept and reject controls.

## 9. Data and Config Specification
### 9.1 Input Sources
- Geospatial data from assets/Boreal_passage_coordinates.csv.
- Scenario profiles in JSON.

### 9.2 Config Categories
- Entity templates.
- Initial allocations.
- Objective weights.
- Constraint presets.
- Threat wave patterns.

### 9.3 Validation
- Runtime validation required before scenario load.
- Invalid config must fail fast with actionable errors.

## 10. KPI Specification
Required KPIs:
- Weighted asset survival score.
- Total expected vs realized damage.
- Threat interception success rate.
- Time under critical vulnerability.
- Reserve readiness over time.
- Improvement vs baseline policy.

## 11. Quality and Test Specification
### 11.1 Unit Tests
- Domain validation.
- Engagement math.
- Constraint enforcement.

### 11.2 Integration Tests
- Deterministic replay consistency.
- Policy behavior under controlled scenarios.
- API and UI recommendation flow.

### 11.3 Acceptance Tests
- Surprise constraint injection requires config-only change.
- Helper outperforms baseline on agreed KPI set.

### 11.4 Story-to-Test Mapping
- US-001: integration test for recommendation generation and accept/reject state transitions.
- US-002: simulation behavior test that confirms enemy target shift after sustained imbalance.
- US-003: schema and loader tests for config edits and constraint enforcement.
- US-004: API contract test for reason codes and rejected-alternative rationale payload.
- US-005: replay test comparing optimizer vs baseline KPI deltas.
- US-006: UI integration test for local/global resource posture visibility and pre-commit delta preview.
- TS-001: build and lint pipeline verification on clean checkout.
- TS-002: contract tests for runtime validation error coverage.
- TS-003: deterministic replay parity tests.
- TS-004: policy interface conformance and timeout fallback tests.
- TS-005: regression harness tests with threshold gates.

## 12. User Story Set (Draft v1)
### 12.1 Primary Story
As an air defense commander, I want ranked response recommendations with long-term readiness impact so that I can defend high-value assets now without creating future vulnerabilities.

Acceptance criteria:
- At each tick with active threats, system returns at least 1 and up to 3 ranked recommendations.
- Each recommendation includes immediate and future impact fields.
- Operator can accept or reject within one action.
- Chosen action updates world state and event timeline in the next tick.

### 12.2 Adversarial Adaptation Story
As a scenario analyst, I want enemy behavior to adapt to defense overcommitment so that we can evaluate whether helper recommendations remain robust.

Acceptance criteria:
- If one sector is over-defended for N ticks, enemy policy increases pressure on less defended high-value sectors.
- Event log records adaptation trigger and rationale tags.

### 12.3 Flexibility Story
As a hackathon operator, I want to modify objectives and constraints via config so that I can handle surprise challenge conditions without changing source code.

Acceptance criteria:
- Objective weights can be changed in scenario JSON.
- Constraint presets can be enabled or disabled per run.
- System validates and reloads scenario profiles successfully.

### 12.4 Explainability Story
As a decision maker, I want each recommendation to include why alternatives were not selected so that I can trust and defend the decision.

Acceptance criteria:
- Recommendation response includes top reason codes.
- At least one rejected alternative is shown with rejection rationale.

## 13. Open Questions for Team Alignment
- Which solver library will we use first in TypeScript?
- What maximum scenario size must meet the latency target?
- Should uncertainty be deterministic-only in milestone 1 or include probabilistic effects?
- Do we need drag-and-drop assignment in UI now, or is accept/reject sufficient?

## 14. Implementation Phases
1. Phase A: Type contracts, schema validation, and CSV loader.
2. Phase B: Tick engine and deterministic replay.
3. Phase C: Enemy and helper optimization with fallback heuristic.
4. Phase D: UI recommendation workflow and explainability.
5. Phase E: KPI dashboard, baseline comparison, and demo scripts.

## 14.1 Milestone Exit Criteria
### Milestone A Exit
- Scenario schema validates fixtures and rejects malformed payloads.
- Boreal map entities load into normalized world state.
- Static map renders defensible entities and initial response allocations.

### Milestone B Exit
- Tick engine updates movement, cooldown, and threat ETA deterministically.
- Replay harness reproduces identical event logs from seed and decisions.
- Event timeline captures at least detect, assign, intercept, and impact events.

### Milestone C Exit
- Helper policy returns 1 to 3 ranked actions with score and confidence.
- Enemy policy adapts to underdefended sectors under controlled test setup.
- Timeout path triggers fallback heuristic with explicit reason code.

### Milestone D Exit
- Operator can accept or reject recommendation and see immediate next-tick effects.
- Recommendation panel shows rationale tags and one rejected alternative rationale.
- Resource posture panel shows local and global counts plus projected delta.

### Milestone E Exit
- Baseline comparison report includes agreed KPI deltas.
- Demo scenario supports config-only surprise condition injection.
- End-to-end demo runbook executes without manual code changes.

## 14.2 Demo Runbook
1. Load baseline scenario profile and seed.
2. Run opening wave and accept top-ranked helper recommendation.
3. Show resource posture impact at local and global levels.
4. Inject surprise condition through config preset toggle.
5. Re-run from checkpoint and show adapted recommendations.
6. Present KPI deltas versus baseline policy.
7. If optimizer times out, demonstrate fallback recommendation path and rationale tags.

## 14.3 Risk Register
- Risk: solver latency spike under larger action spaces.
	Mitigation: cap candidate set and enforce timeout with fallback heuristic.
	Owner: simulation/policy lead.
- Risk: schema drift between backend and UI payloads.
	Mitigation: shared contracts package and CI contract tests.
	Owner: platform lead.
- Risk: non-deterministic replay caused by hidden randomness.
	Mitigation: single seeded RNG provider and deterministic sort order for events/actions.
	Owner: engine lead.
- Risk: demo fragility from scenario misconfiguration.
	Mitigation: locked demo fixtures, preflight validator, and backup seed.
	Owner: demo owner.

## 15. Definition of Done
- End-to-end scenario can be executed from load to outcome.
- Enemy adapts to weak coverage and helper responds with ranked recommendations.
- Operator interaction accepts/rejects recommendations in UI.
- KPI report shows baseline comparison.
- Surprise condition can be applied by config-only edits.
