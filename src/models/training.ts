import type { Vector } from "./entity";

export type CommandMode = "auto" | "training";

export type TrainingDeployRequest = {
  resourceId: string;
  mission: "intercept" | "reinforce" | "recon";
  targetId?: string;
  targetPosition?: Vector;
};
