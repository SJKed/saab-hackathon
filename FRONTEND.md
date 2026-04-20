# 🎯 FRONTEND_AGENTS.md
## Project: Defense Simulation System (Hackathon)

---

## 🧠 Purpose
This frontend is a **real-time tactical simulation UI** that visualizes:
- Enemy movement
- Friendly resources
- Threat levels
- AI-driven decisions

The UI must feel:
- Tactical
- Responsive
- Explainable

---

## ⚙️ Tech Constraints
- Vanilla JS + TypeScript ONLY
- No frameworks (no Angular/React)
- No heavy dependencies
- Use Canvas API for rendering
- Use requestAnimationFrame for animation loop

---

## 🎨 Design Language (Military Theme)

### Color Palette

| Element              | Color        |
|---------------------|-------------|
| Background          | #0b1a1e (deep navy) |
| Terrain (land)      | #1f3a2e (military green) |
| Water               | #0a2a43 |
| Grid                | rgba(255,255,255,0.05) |
| Friendly units      | #4cc9f0 (cyan blue) |
| Enemy units         | #ff6b6b (soft red) |
| Bases               | #ffd166 (yellow) |
| Neutral             | #e0e0e0 |
| Threat heatmap      | rgba(255, 0, 0, 0.3) |

---

## 🧭 UI Components

### 1. Main Map Canvas
- Fullscreen canvas
- Renders:
  - Terrain
  - Entities
  - Movement
  - Heatmap overlay

---

### 2. Control Panel (Right side)
- Simulation speed slider
- Start / Pause
- Strategy toggle:
  - Aggressive
  - Defensive
  - Balanced

---

### 3. Info Panel (Bottom / Overlay)
Displays:
- Selected entity
- Threat level
- Assigned resources
- Explanation (WHY decisions were made)

---

### 4. Debug Overlay (Optional but powerful)
- FPS
- Active threats
- Resource usage

---

## 🧠 UX Behavior

### Interaction
- Click entity → highlight + show info
- Hover base → show threat score
- Toggle heatmap

---

### Animation
- Smooth movement (lerp)
- No teleporting units
- Show assignment lines:
  - Resource → Target

---

### Visual Feedback
- Flash when base under attack
- Fade-in threats
- Pulse high-risk zones

---

## 📦 Rendering Architecture

### Layers (important)

1. Background (terrain)
2. Grid
3. Entities
4. Paths / assignments
5. Heatmap
6. UI overlays

---

## 🔁 Render Loop

```ts
function render() {
  clearCanvas();
  drawTerrain();
  drawGrid();
  drawEntities();
  drawAssignments();
  drawHeatmap();
  requestAnimationFrame(render);
}

⚡ Performance Rules
Use spatial partitioning if needed (grid buckets)
Avoid re-rendering static terrain
Keep entity list flat (no deep nesting)

🧪 Future Enhancements
Fog of war
Zoom + pan
Replay system

✅ Definition of Done
Smooth simulation
Clear threat visualization
Visible AI decisions
No UI lag