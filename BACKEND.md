
---

# 📁 2. BACKEND_AGENTS.md (Simulation Engine)

```md
# 🧠 BACKEND_AGENTS.md
## Project: Defense Simulation Engine

---

## 🎯 Purpose
Implements the **decision engine** responsible for:
- Threat calculation
- Prediction
- Resource allocation
- Simulation updates

Runs entirely in frontend (no server)

---

## ⚙️ Core Principles

- Deterministic (same input → same result)
- Tick-based simulation
- Stateless calculations where possible
- Modular logic (pluggable strategies)

---

## 🧱 Architecture
/engine
threat.ts
prediction.ts
allocation.ts
scoring.ts

/simulation
loop.ts
state.ts
updater.ts

/models
entity.ts
resource.ts
base.ts


---

## 📊 Data Models

```ts
type Vector = {
  x: number;
  y: number;
};

type Base = {
  id: string;
  position: Vector;
  value: number;
  threat: number;
};

type Enemy = {
  id: string;
  position: Vector;
  velocity: Vector;
  type: 'attacker' | 'flanker' | 'recon';
  threatLevel: number;
  targetId?: string;
};

type Resource = {
  id: string;
  type: 'drone' | 'air-defense' | 'robot';
  position: Vector;
  speed: number;
  range: number;
  cooldown: number;
  available: boolean;
};

Simulation loop
tick() {
  updateEnemyPositions();
  calculateThreats();
  predictFuture();
  allocateResources();
  updateResources();
}

Threat engine
threat(base) =
  Σ(enemy.threatLevel / distance(enemy, base))
  
Prediction Engine
Linear extrapolation
Estimate time-to-impact
futurePosition = position + velocity * t

⚙️ Allocation Engine
Step 1: Base priority
priority = base.value * base.threat
Step 2: Score function
score(resource, base) =
  priority
  - distance(resource, base)
  - cooldownPenalty
Step 3: Assign
Sort bases by priority
Assign best available resource

🧠 Strategy Modes
Aggressive
Early interception
Use all resources
Defensive
Protect high-value only
Keep reserve
Balanced
Hybrid

🧪 Randomness (Controlled)
Add noise to movement
Add uncertainty to threat

📂 Data Input

Use JSON:

{
  "bases": [],
  "enemies": [],
  "resources": []
}
✅ Definition of Done
Stable simulation loop
Real-time updates
Logical resource allocation
Easy to plug new strategies

---

# 📁 PROJECT STRUCTURE

/src
  /engine
    threat.ts
    prediction.ts
    allocation.ts
    scoring.ts

  /simulation
    loop.ts
    state.ts
    updater.ts

  /models
    entity.ts

  /data
    map.json
    coordinates.json

  /ui
    canvas.ts
    renderer.ts
    controls.ts
    panels.ts

  /utils
    math.ts
    helpers.ts

  index.html
  main.ts
  styles.css
  
📁 Map + Coordinates Conversion

You’ll convert your CSV into JSON like this:

{
  "bases": [
    { "id": "B1", "x": 200, "y": 800, "value": 10 }
  ],
  "enemySpawnZones": [
    { "x": 300, "y": 50 }
  ],
  "terrain": {
    "waterZones": [...],
    "landZones": [...]
  }
}

🧠 IMPORTANT

Normalize coordinates to canvas size:

normalizedX = rawX / maxX * canvasWidth
normalizedY = rawY / maxY * canvasHeight