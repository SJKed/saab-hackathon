🧩 Prompt 1 — Project Setup
Create a TypeScript project using vanilla JS (no frameworks).

Requirements:
- index.html with canvas
- main.ts entry point
- basic render loop using requestAnimationFrame
- simple grid drawn on canvas
- use vite as a build process

Output:
- Working canvas with grid
🧩 Prompt 2 — Data Models
Define TypeScript models for:
- Base
- Enemy
- Resource
- Vector

Include:
- Types
- Interfaces
- Example mock data

Output:
- models/entity.ts
🧩 Prompt 3 — Load Map Data
Create a module that loads map.json and converts coordinates to canvas space.

Include:
- normalization function
- data validation

Output:
- data loader module
🧩 Prompt 4 — Render Entities
Render:
- Bases (yellow squares)
- Enemies (red triangles)
- Resources (blue circles)

Include:
- position mapping
- labels

Output:
- renderer.ts
🧩 Prompt 5 — Movement Engine
Implement enemy movement:
- Move toward target base
- Update position every tick

Output:
- simulation/updater.ts
🧩 Prompt 6 — Threat Calculation
Implement threat calculation per base:
- Based on distance and enemy threat

Output:
- engine/threat.ts
🧩 Prompt 7 — Allocation Engine
Implement greedy resource allocation:
- Assign closest available resource to highest threat base

Output:
- engine/allocation.ts
🧩 Prompt 8 — Visualization Enhancements
Add:
- Lines from resource → target
- Heatmap overlay

Output:
- enhanced renderer
🧩 Prompt 9 — Controls
Add UI controls:
- Start/Pause
- Strategy toggle
- Speed slider

Output:
- controls.ts
🧩 Prompt 10 — Explainability Panel
Display:
- Why resource assigned
- Threat score
- Priority score

Output:
- info panel

🧩 Prompt 11 — Fix issue where enemy sends their entire base icon instead of resources.
Display:
- Enemy bases deploying resources instead of the bases moving towards allied bases.
- Use supplied airplane.png and drone.png icons for deployed enemy resources.

Output:
- Enemy bases now deploy resources (airplane and drone icons) instead of moving towards allied bases.

🧩 Prompt 12 — The game should start of paused
Implement:
- Game starts in paused state
- User must click "Start" to begin simulation
- This behaviour should be consistent when pressing restart as well

Output:- Game starts paused, user clicks "Start" to begin.