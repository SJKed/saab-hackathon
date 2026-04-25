# Saab Defense Simulation (Hackathon Mockup)

Real-time tactical defense simulation built with TypeScript, Canvas, and Vite.  
This version includes mission scenarios, explicit win/loss conditions, alerts, onboarding, replay capture, passive sensing, mission-weighted loadouts, and destroyable allied radar stations.

## Quick Start

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Demo Features

- Scenario picker with curated mission presets.
- Custom scenario max tick input with support for `infinite` runs.
- Mission lifecycle with deterministic win/loss evaluation.
- Mission-aware metrics HUD and explainability panel.
- Passive sensor logic that detects radar-emitting enemy platforms.
- Destroyable allied radar stations that act as high-value enemy targets.
- Mission-weighted deterministic loadout composition by scenario profile.
- Alerts for critical state transitions.
- Training mode with command quality feedback.
- Replay timeline capture and end-of-run summary.
- Run-to-run comparison in after-action summary.

## Controls

- Start/Pause: run or halt simulation loop.
- Step Tick: advance exactly one simulation tick.
- Strategy: aggressive/defensive/balanced speed posture factor.
- Allied Control: AI Auto or Training mode.
- Training panel: operator deploy/recall commands and AI coaching.
- Scenario picker max ticks: numeric value or `infinite`.

## Judge Script (4 Minutes)

1. Select `Baseline Shield`, set max ticks (e.g. `320`), and start.
2. Show passive detection in debug summary and radar station status.
3. Switch to Training mode and issue one manual intercept command.
4. Highlight command assessment feedback (good/neutral/risky).
5. Let mission resolve to show after-action summary.
6. Restart with `Surge Containment` and run `infinite` to stress behavior.

## Test and Build

```bash
npm run test
npm run build
```
