import type { EnemyAggressionOverride } from "./debug";

export type MissionOutcome = "inProgress" | "won" | "lost";

export type MissionObjective = {
  minCitiesSurviving: number;
  maxTicks: number | null;
  maxCityLosses: number;
};

export type ScenarioPreset = {
  id: string;
  name: string;
  description: string;
  briefing: string;
  aggressionOverride: EnemyAggressionOverride;
  objective: MissionObjective;
  seed: number;
};

export const scenarioPresets: ScenarioPreset[] = [
  {
    id: "baseline-shield",
    name: "Baseline Shield",
    description: "Balanced pressure with enough room to demonstrate explainability.",
    briefing:
      "Enemy probes are steady. Maintain coverage discipline and intercept early without draining reserves.",
    aggressionOverride: "opening",
    objective: {
      minCitiesSurviving: 2,
      maxTicks: 280,
      maxCityLosses: 1,
    },
    seed: 101,
  },
  {
    id: "attrition-race",
    name: "Attrition Race",
    description: "Sustained pressure where response speed decides mission success.",
    briefing:
      "Enemy waves escalate quickly. Prioritize threat triage and avoid overcommitting premium interceptors.",
    aggressionOverride: "pressure",
    objective: {
      minCitiesSurviving: 2,
      maxTicks: 320,
      maxCityLosses: 1,
    },
    seed: 207,
  },
  {
    id: "surge-containment",
    name: "Surge Containment",
    description: "High-intensity assault intended for showcase stress testing.",
    briefing:
      "A coordinated surge is expected. Trade efficiency for survival and preserve at least one city under heavy strike load.",
    aggressionOverride: "surge",
    objective: {
      minCitiesSurviving: 1,
      maxTicks: 360,
      maxCityLosses: 2,
    },
    seed: 309,
  },
];

export function getScenarioById(id: string): ScenarioPreset {
  return scenarioPresets.find((scenario) => scenario.id === id) ?? scenarioPresets[0];
}
