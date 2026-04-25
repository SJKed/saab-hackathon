export type EnemyAggressionOverride = "auto" | "opening" | "pressure" | "surge";

export type DebugSettings = {
  disabledAlliedBaseIds: string[];
  disabledEnemyBaseIds: string[];
  alliedDamageMultiplier: number;
  enemyDamageMultiplier: number;
  fuelBurnMultiplier: number;
  enemyAggressionOverride: EnemyAggressionOverride;
};

export const defaultDebugSettings: DebugSettings = {
  disabledAlliedBaseIds: [],
  disabledEnemyBaseIds: [],
  alliedDamageMultiplier: 1,
  enemyDamageMultiplier: 1,
  fuelBurnMultiplier: 1,
  enemyAggressionOverride: "auto",
};

export function cloneDebugSettings(settings: DebugSettings): DebugSettings {
  return {
    ...settings,
    disabledAlliedBaseIds: [...settings.disabledAlliedBaseIds],
    disabledEnemyBaseIds: [...settings.disabledEnemyBaseIds],
  };
}

export function isAlliedBaseDeploymentDisabled(
  settings: DebugSettings,
  baseId: string | undefined,
): boolean {
  return Boolean(baseId && settings.disabledAlliedBaseIds.includes(baseId));
}

export function isEnemyBaseDeploymentDisabled(
  settings: DebugSettings,
  baseId: string | undefined,
): boolean {
  return Boolean(baseId && settings.disabledEnemyBaseIds.includes(baseId));
}
