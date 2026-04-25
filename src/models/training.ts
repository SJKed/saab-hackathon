export type CommandMode = "auto" | "training";

export type TrainingDeployRequest = {
  resourceId: string;
  mission: "intercept" | "reinforce";
  targetId: string;
};
