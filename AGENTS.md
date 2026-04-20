# 🧭 AGENTS.md
## Project: Real-Time Defense Simulation System

---

## 🎯 Overview

This project is a **web-based real-time defense simulation system** built for a hackathon.

The system simulates a military scenario where:
- Enemy units approach from the north
- Friendly bases must be protected
- Limited defensive resources must be allocated intelligently

The goal is to demonstrate:
👉 **autonomous decision-making under uncertainty with limited resources**

---

## 🧠 Core Capabilities

The system must:

1. **Ingest map + coordinate data**
2. **Simulate enemy movement**
3. **Continuously evaluate threats**
4. **Predict near-future scenarios**
5. **Allocate defensive resources**
6. **Visualize everything in real-time**

---

## ⚙️ High-Level Architecture

This is a **frontend-only application** with two logical layers:

### 1. Simulation Engine ("Backend logic in frontend")
- Handles:
  - Threat calculation
  - Prediction
  - Resource allocation
  - State updates

📄 Defined in → `BACKEND_AGENTS.md`

---

### 2. Visualization Layer (UI)
- Handles:
  - Map rendering
  - Entity visualization
  - User interaction
  - Debug + explanation panels

📄 Defined in → `FRONTEND_AGENTS.md`

---

## 📁 Assets

All static input data is stored in:
/assets
map.png → background map image
coordinates.csv → raw coordinate data
map.json → processed map data (generated)


---

## 🧩 Data Flow


coordinates.csv
↓ (parsed & normalized)
map.json
↓
simulation state
↓
rendered on canvas


---

## 🧠 Simulation Loop (Core Concept)

The system runs in continuous ticks:

```ts
while (running) {
  updateEnemyPositions();
  calculateThreats();
  predictFutureStates();
  allocateResources();
  updateSimulationState();
  render();
}
🗺️ Coordinate System
Raw coordinates come from CSV
Must be normalized to canvas space
Origin: top-left
Y increases downward
⚔️ Entities in the System
Friendly
Bases (high-value targets)
Resources:
Drones
Air defense systems
Ground robots
Enemy
Moving units with different behaviors:
Attackers
Flankers
Recon
🎮 Simulation Principles
Tick-based updates (e.g. every 200–1000ms)
Deterministic logic (same input → same output)
Real-time visual feedback
Smooth movement (no teleportation)
🧪 Strategy Modes

The system supports multiple decision strategies:

Aggressive → intercept early, use all resources
Defensive → protect high-value targets only
Balanced → hybrid approach
🎯 Key Evaluation Metrics

The system should track:

Bases protected (%)
Damage prevented
Resource efficiency
Response time to threats
🚫 Constraints
No backend server
No frameworks (Angular/React)
Use:
TypeScript
Vanilla JS
HTML Canvas
📦 Project Structure (Overview)
/src
  /engine        → decision logic
  /simulation    → loop + state
  /models        → data models
  /ui            → rendering + controls
  /data          → processed JSON

/assets          → raw inputs (map + CSV)
🔗 Responsibilities
Layer	File
UI / UX	FRONTEND_AGENTS.md
Simulation	BACKEND_AGENTS.md
🚀 Development Flow

Follow this order:

Setup canvas + render loop
Load and normalize data
Render static map + entities
Add enemy movement
Add threat calculation
Add resource allocation
Add UI controls
Add visual enhancements
🧠 Design Philosophy
Keep logic simple but believable
Prioritize visual clarity over algorithm complexity
Make decisions explainable
Optimize for demo impact, not perfection
✅ Definition of Done

The system is complete when:

Map renders correctly
Enemies move dynamically
Threats are visible
Resources are allocated automatically
UI reflects decisions in real time
Simulation feels intelligent and responsive