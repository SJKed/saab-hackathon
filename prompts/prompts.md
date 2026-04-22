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

Output:
- Game starts paused, user clicks "Start" to begin.

🧩 Prompt 13 - Resource deployment
Changes: 
- Allied cities, Callhaven, Solano and Meridia are cities (priority defensible positions) and not allocatable resources.
Implement:
- Update map data to classify Callhaven, Solano, and Meridia as allied cities instead of resources
- Update rendering to reflect this change (e.g., different icons or colors)
- map.json "bases" data should act as the "alliedSpawnZones" for resources.
- Allied resources should be deployed from allied spawn zones (bases) and either intercept enemy resources or reinforce allied cities.
- Allied resources should determine trajectory to enemy resource as to intercept them before they reach allied cities.

Output:
- Callhaven, Solano, and Meridia are now classified as allied cities and not resources.
- Allied resources are deployed from allied spawn zones (bases) and can intercept enemy resources or reinforce allied cities.

🧩 Prompt 14 - Combat calculations and Event log
- All bases and resources should have a attack stat, defense stat and health stat.
- When a resource engages a base or enemy resource, both entities should perform a damage calculation against eachother. Where inflicted damage is equal to (((attackers attack stat * (attackers attack stat / defenders defense stat)) / 50) + 2)
- If an entities health drops to 0 or below, it is removed from the game.
- Implement an event log that displays combat events (e.g., "Resource A attacked Base B for X damage. Base B has Y health remaining.")
- When a allied resource engages an enemy resource, the two entities should stop their current trajectory and engage in combat until one is destroyed.

Output:
- Combat calculations are implemented, and an event log displays combat events. Allied resources engage enemy resources in combat until one is destroyed.

🧩 Prompt 15 - Explainability Panel UX
- Make the explainability panel more user-friendly and visually appealing.
- Use a clean layout with clear headings and sections for each piece of information (e.g., "Resource Assignment Explanation", "Threat Score", "Priority Score").
- Consider using icons or color-coding to enhance readability and quickly convey information (e.g., green for low threat, red for high threat).
- Ensure the panel is responsive and does not obstruct the main game view.
- Make the panel resizable or collapsible to allow users to customize their view.

Output:- The explainability panel has a clean layout with clear headings and sections, uses icons and color-coding for readability, is responsive, and can be resized or collapsed to avoid obstructing the main game view.