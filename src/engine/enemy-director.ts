import type {
  AlliedCity,
  AlliedSpawnZone,
  EnemyBase,
  MobilePlatform,
  PlatformClass,
} from "../models/entity";
import { distanceKm, pixelToWorldDistance } from "../models/distance";
import {
  isEnemyBaseDeploymentDisabled,
  type DebugSettings,
} from "../models/debug";
import { ENEMY_DEPLOYMENT_HOLD_SECONDS } from "../models/platform-constants";
import {
  clonePlatform,
  hasUsablePayload,
  isPlatformDeployed,
  isPlatformDestroyed,
  isPlatformStored,
} from "../models/platform-utils";
import {
  allocateResources,
  type ResourceAssignment,
} from "./allocation";
import {
  applyPostureMemory,
  createTeamPostureMemory,
  evaluateEnemyForcePosture,
  type EnemyForcePostureSnapshot,
  type TeamPostureMemory,
} from "./posture";

export type EnemyAggressionTier = "opening" | "pressure" | "surge";

type BaseDirectorState = {
  nextLaunchTick: number;
  launchesIssued: number;
  lastTargetCityId?: string;
};

type CityExposureBreakdown = {
  cityId: string;
  cityName: string;
  exposure: number;
  deployedCoverage: number;
  reserveCoverage: number;
  inboundPressure: number;
  activeThreatCount: number;
};

const deployedCoverageDistanceScale = pixelToWorldDistance(240);
const reserveCoverageDistanceScale = pixelToWorldDistance(320);
const inboundPressureDistanceScale = pixelToWorldDistance(260);
const sensorRangeScoreScale = pixelToWorldDistance(250);
const targetSelectionProximityScale = pixelToWorldDistance(980);

type AggressionProfile = {
  tier: EnemyAggressionTier;
  label: string;
  aggressionPercent: number;
  activeEnemyCap: number;
  intervalTicks: number;
  maxWaveSize: number;
  missileQuota: number;
  classOrder: PlatformClass[];
};

export type EnemyDirectorSnapshot = {
  aggressionTier: EnemyAggressionTier;
  aggressionLabel: string;
  aggressionPercent: number;
  activeEnemyCount: number;
  activeEnemyCap: number;
  postureSnapshot: EnemyForcePostureSnapshot;
  cityExposureScores: CityExposureBreakdown[];
  recentLaunches: string[];
};

export type EnemyDirectorState = {
  baseStates: Record<string, BaseDirectorState>;
  postureMemory: TeamPostureMemory;
  allocationPostureMemory: TeamPostureMemory;
  snapshot: EnemyDirectorSnapshot;
};

type CoordinateEnemyDeploymentsResult = {
  enemyPlatforms: MobilePlatform[];
  directorState: EnemyDirectorState;
};

const ticksPerSecond = 4;
const initialLaunchTick = 4;
const baseLaunchStaggerTicks = 6;
const maxRecentLaunches = 6;

function toMirrorDebugSettingsForEnemy(debugSettings: DebugSettings): DebugSettings {
  return {
    ...debugSettings,
    disabledAlliedBaseIds: [...debugSettings.disabledEnemyBaseIds],
  };
}

function toEnemyDecisionCities(enemyBases: EnemyBase[], alliedPlatforms: MobilePlatform[]): AlliedCity[] {
  return enemyBases.map((base) => {
    const inboundThreat = alliedPlatforms.filter((platform) => {
      if (!isPlatformDeployed(platform)) {
        return false;
      }
      const distance = distanceKm(platform.position, base.position);
      return distance <= targetSelectionProximityScale;
    }).length;

    return {
      ...base,
      value: 12,
      threat: Math.min(1, inboundThreat / 4),
    };
  });
}

function toEnemyDecisionSpawnZones(enemyBases: EnemyBase[]): AlliedSpawnZone[] {
  return enemyBases.map((base) => ({
    ...base,
  }));
}

function toEnemyDecisionResources(enemyPlatforms: MobilePlatform[]): MobilePlatform[] {
  return enemyPlatforms.map((platform) => ({
    ...platform,
    team: "allied",
  }));
}

function toEnemyDecisionThreats(alliedPlatforms: MobilePlatform[]): MobilePlatform[] {
  return alliedPlatforms.map((platform) => ({
    ...platform,
    team: "enemy",
  }));
}

function getAggressionProfileForTier(
  tier: EnemyAggressionTier,
  enemyBaseCount: number,
): AggressionProfile {
  switch (tier) {
    case "opening":
      return {
        tier: "opening",
        label: "Opening Probe",
        aggressionPercent: 26,
        activeEnemyCap: enemyBaseCount + 1,
        intervalTicks: 24,
        maxWaveSize: 1,
        missileQuota: 0,
        classOrder: ["drone", "fighterJet", "ballisticMissile"],
      };
    case "pressure":
      return {
        tier: "pressure",
        label: "Escalating Pressure",
        aggressionPercent: 58,
        activeEnemyCap: Math.max(enemyBaseCount + 2, enemyBaseCount * 2),
        intervalTicks: 15,
        maxWaveSize: 2,
        missileQuota: 1,
        classOrder: ["fighterJet", "drone", "ballisticMissile"],
      };
    case "surge":
      return {
        tier: "surge",
        label: "Coordinated Surge",
        aggressionPercent: 86,
        activeEnemyCap: Math.max(enemyBaseCount + 4, enemyBaseCount * 3),
        intervalTicks: 9,
        maxWaveSize: 3,
        missileQuota: 1,
        classOrder: ["ballisticMissile", "fighterJet", "drone"],
      };
  }
}

function getAggressionProfile(
  tick: number,
  enemyBaseCount: number,
  debugSettings: DebugSettings,
): AggressionProfile {
  if (debugSettings.enemyAggressionOverride !== "auto") {
    return getAggressionProfileForTier(
      debugSettings.enemyAggressionOverride,
      enemyBaseCount,
    );
  }

  const elapsedSeconds = tick / ticksPerSecond;
  if (elapsedSeconds < 28) {
    return getAggressionProfileForTier("opening", enemyBaseCount);
  }
  if (elapsedSeconds < 72) {
    return getAggressionProfileForTier("pressure", enemyBaseCount);
  }
  return getAggressionProfileForTier("surge", enemyBaseCount);
}

function getClassWeight(platform: MobilePlatform): number {
  switch (platform.platformClass) {
    case "fighterJet":
      return 1.15;
    case "drone":
      return 0.9;
    case "ballisticMissile":
      return 1.45;
    default:
      return 1;
  }
}

function getCoverageContribution(
  platform: MobilePlatform,
  city: AlliedCity,
  distanceScale: number,
  weightMultiplier: number,
): number {
  const distanceFactor =
    1 / (1 + distanceKm(platform.position, city.position) / distanceScale);
  const platformStrength =
    getClassWeight(platform) *
    (0.5 +
      platform.sensors.sensorRange / sensorRangeScoreScale +
      platform.combat.maxDurability / 210);

  return platformStrength * distanceFactor * weightMultiplier;
}

function getCityExposureBreakdown(
  city: AlliedCity,
  alliedPlatforms: MobilePlatform[],
  enemyPlatforms: MobilePlatform[],
): CityExposureBreakdown {
  let deployedCoverage = 0;
  let reserveCoverage = 0;
  let inboundPressure = 0;
  let activeThreatCount = 0;

  for (const alliedPlatform of alliedPlatforms) {
    if (isPlatformDestroyed(alliedPlatform) || !hasUsablePayload(alliedPlatform)) {
      continue;
    }

    if (isPlatformDeployed(alliedPlatform)) {
      deployedCoverage += getCoverageContribution(
        alliedPlatform,
        city,
        deployedCoverageDistanceScale,
        0.92,
      );
      continue;
    }

    if (isPlatformStored(alliedPlatform)) {
      reserveCoverage += getCoverageContribution(
        alliedPlatform,
        city,
        reserveCoverageDistanceScale,
        0.42,
      );
    }
  }

  for (const enemyPlatform of enemyPlatforms) {
    if (!isPlatformDeployed(enemyPlatform)) {
      continue;
    }

    const proximityFactor =
      1 /
      (1 + distanceKm(enemyPlatform.position, city.position) / inboundPressureDistanceScale);
    const targetBias = enemyPlatform.targetId === city.id ? 1.25 : 0.55;
    const pressureWeight =
      enemyPlatform.threatLevel *
      getClassWeight(enemyPlatform) *
      Math.max(proximityFactor, enemyPlatform.targetId === city.id ? 0.85 : 0);

    inboundPressure += pressureWeight * targetBias;

    if (enemyPlatform.targetId === city.id) {
      activeThreatCount += 1;
    }
  }

  const thinCoveragePenalty = Math.max(0, 3.1 - deployedCoverage) * 1.1;
  const thinReservePenalty = Math.max(0, 2.5 - reserveCoverage) * 1.2;
  const saturationPenalty = activeThreatCount * 0.28;
  const exposure =
    city.value * 0.42 +
    inboundPressure * 1.85 +
    thinCoveragePenalty +
    thinReservePenalty -
    saturationPenalty;

  return {
    cityId: city.id,
    cityName: city.name ?? city.id,
    exposure,
    deployedCoverage,
    reserveCoverage,
    inboundPressure,
    activeThreatCount,
  };
}

function getTopCityExposureScores(
  alliedCities: AlliedCity[],
  alliedPlatforms: MobilePlatform[],
  enemyPlatforms: MobilePlatform[],
): CityExposureBreakdown[] {
  return alliedCities
    .map((city) =>
      getCityExposureBreakdown(city, alliedPlatforms, enemyPlatforms),
    )
    .sort((a, b) => b.exposure - a.exposure);
}

function getOrCreateBaseState(
  state: EnemyDirectorState,
  baseId: string,
  baseIndex: number,
): BaseDirectorState {
  return (
    state.baseStates[baseId] ?? {
      nextLaunchTick: initialLaunchTick + (baseIndex * baseLaunchStaggerTicks),
      launchesIssued: 0,
    }
  );
}

function getWaveDelaySeconds(baseIndex: number, waveIndex: number): number {
  return (baseIndex * 0.08) + (waveIndex * 0.62);
}

function getNextLaunchIntervalTicks(
  profile: AggressionProfile,
  baseIndex: number,
  launchedCount: number,
): number {
  const baseOffset = Math.max(0, 3 - baseIndex);
  const wavePenalty = Math.max(0, launchedCount - 1);

  return profile.intervalTicks + baseOffset + wavePenalty;
}

function getWaveSize(
  profile: AggressionProfile,
  baseState: BaseDirectorState,
  tick: number,
  availableSlots: number,
  storedCount: number,
): number {
  const overdueTicks = Math.max(0, tick - baseState.nextLaunchTick);
  const overdueBonus = overdueTicks >= profile.intervalTicks ? 1 : 0;
  const baseWaveSize =
    profile.tier === "opening"
      ? 1
      : profile.tier === "pressure"
        ? 2
        : 2;

  return Math.max(
    1,
    Math.min(
      profile.maxWaveSize,
      storedCount,
      availableSlots,
      baseWaveSize + overdueBonus,
    ),
  );
}

function selectTargetCity(
  base: EnemyBase,
  baseState: BaseDirectorState,
  alliedCities: AlliedCity[],
  cityExposureScores: CityExposureBreakdown[],
): CityExposureBreakdown | undefined {
  let bestCity: CityExposureBreakdown | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const cityExposure of cityExposureScores) {
    const city = alliedCities.find((candidate) => candidate.id === cityExposure.cityId);
    const cityDistance = city
      ? distanceKm(base.position, city.position)
      : Number.POSITIVE_INFINITY;
    const proximityBias =
      Math.max(0.22, 2 - cityDistance / targetSelectionProximityScale);
    const continuityBonus =
      baseState.lastTargetCityId === cityExposure.cityId ? 0.18 : 0;
    const saturationPenalty = cityExposure.activeThreatCount * 0.35;
    const score =
      cityExposure.exposure * 1.28 +
      proximityBias +
      continuityBonus -
      saturationPenalty;

    if (score > bestScore) {
      bestScore = score;
      bestCity = cityExposure;
    }
  }

  return bestCity;
}

function selectPlatformsForWave(
  storedPlatforms: MobilePlatform[],
  profile: AggressionProfile,
  desiredWaveSize: number,
  targetCityExposure: CityExposureBreakdown,
): MobilePlatform[] {
  const groupedPlatforms: Record<PlatformClass, MobilePlatform[]> = {
    fighterJet: [],
    drone: [],
    ballisticMissile: [],
  };

  for (const platform of storedPlatforms) {
    groupedPlatforms[platform.platformClass].push(platform);
  }

  const selected: MobilePlatform[] = [];
  let missilesSelected = 0;
  const allowMissiles =
    profile.missileQuota > 0 &&
    (profile.tier === "surge" || targetCityExposure.exposure >= 6.9);
  const classSequence = [...profile.classOrder, ...profile.classOrder];

  for (const platformClass of classSequence) {
    if (selected.length >= desiredWaveSize) {
      break;
    }

    if (
      platformClass === "ballisticMissile" &&
      (!allowMissiles || missilesSelected >= profile.missileQuota)
    ) {
      continue;
    }

    const candidate = groupedPlatforms[platformClass].shift();
    if (!candidate) {
      continue;
    }

    selected.push(candidate);
    if (platformClass === "ballisticMissile") {
      missilesSelected += 1;
    }
  }

  if (selected.length >= desiredWaveSize) {
    return selected;
  }

  for (const platformClass of ["fighterJet", "drone", "ballisticMissile"] as const) {
    while (selected.length < desiredWaveSize) {
      if (
        platformClass === "ballisticMissile" &&
        missilesSelected >= profile.missileQuota
      ) {
        break;
      }

      const candidate = groupedPlatforms[platformClass].shift();
      if (!candidate) {
        break;
      }

      selected.push(candidate);
      if (platformClass === "ballisticMissile") {
        missilesSelected += 1;
      }
    }
  }

  return selected;
}

function getLaunchReason(targetCityExposure: CityExposureBreakdown): string {
  if (targetCityExposure.reserveCoverage <= 1.25) {
    return "Local allied reserve is thin.";
  }

  if (targetCityExposure.deployedCoverage <= 1.8) {
    return "Current defensive coverage is light.";
  }

  if (targetCityExposure.inboundPressure >= 1.5) {
    return "Ongoing pressure is forcing a layered response.";
  }

  return "The city remains the most exposed defended objective.";
}

function getWaveSummary(platforms: MobilePlatform[]): string {
  const counts = {
    fighterJet: 0,
    drone: 0,
    ballisticMissile: 0,
  };

  for (const platform of platforms) {
    counts[platform.platformClass] += 1;
  }

  const parts: string[] = [];
  if (counts.fighterJet > 0) {
    parts.push(`${counts.fighterJet} jet${counts.fighterJet === 1 ? "" : "s"}`);
  }
  if (counts.drone > 0) {
    parts.push(`${counts.drone} drone${counts.drone === 1 ? "" : "s"}`);
  }
  if (counts.ballisticMissile > 0) {
    parts.push(
      `${counts.ballisticMissile} missile${counts.ballisticMissile === 1 ? "" : "s"}`,
    );
  }

  return parts.join(", ");
}

export function createEnemyDirectorState(
  enemyBases: EnemyBase[],
): EnemyDirectorState {
  const baseStates = Object.fromEntries(
    enemyBases.map((base, baseIndex) => [
      base.id,
      {
        nextLaunchTick: initialLaunchTick + (baseIndex * baseLaunchStaggerTicks),
        launchesIssued: 0,
      },
    ]),
  );
  const postureMemory = createTeamPostureMemory();

  return {
    baseStates,
    postureMemory,
    allocationPostureMemory: createTeamPostureMemory(),
    snapshot: {
      aggressionTier: "opening",
      aggressionLabel: "Opening Probe",
      aggressionPercent: 26,
      activeEnemyCount: 0,
      activeEnemyCap: Math.max(1, enemyBases.length + 1),
      postureSnapshot: {
        stance: "balanced",
        summary: "Launch appetite and active pressure are broadly matched.",
        demandScore: 0,
        activeBurdenScore: 0,
        usefulAirborneScore: 0,
        reserveScore: 0,
        surplusScore: 0,
        sustainedSurplusSeconds: 0,
        sustainedDemandSeconds: 0,
        recallPressureActive: false,
        launchReleaseActive: false,
        recommendedActiveCount: Math.max(1, enemyBases.length),
        opportunityCount: 0,
        cityStates: [],
      },
      cityExposureScores: [],
      recentLaunches: [],
    },
  };
}

export function coordinateEnemyDeployments(
  state: EnemyDirectorState,
  tick: number,
  alliedCities: AlliedCity[],
  alliedPlatforms: MobilePlatform[],
  enemyPlatforms: MobilePlatform[],
  enemyBases: EnemyBase[],
  deltaSeconds: number,
  debugSettings: DebugSettings,
): CoordinateEnemyDeploymentsResult {
  const profile = getAggressionProfile(tick, enemyBases.length, debugSettings);
  const decisionAllocation = allocateResources(
    toEnemyDecisionCities(enemyBases, alliedPlatforms),
    toEnemyDecisionSpawnZones(enemyBases),
    toEnemyDecisionResources(enemyPlatforms),
    toEnemyDecisionThreats(alliedPlatforms),
    state.allocationPostureMemory,
    deltaSeconds,
    toMirrorDebugSettingsForEnemy(debugSettings),
  );
  const enemyAssignmentsByResourceId = new Map<string, ResourceAssignment>(
    decisionAllocation.assignments
      .filter((assignment) => assignment.mission === "intercept")
      .map((assignment) => [assignment.resourceId, assignment]),
  );
  const cityExposureScores = getTopCityExposureScores(
    alliedCities,
    alliedPlatforms,
    enemyPlatforms,
  );
  const posture = applyPostureMemory(
    evaluateEnemyForcePosture(
      alliedCities,
      alliedPlatforms,
      enemyPlatforms,
      enemyBases,
      profile.aggressionPercent / 100,
    ),
    state.postureMemory,
    deltaSeconds,
    {
      surplusThreshold: 1.9,
      demandGapThreshold: 1,
    },
  );
  const postureSnapshot = posture.snapshot;
  const postureByCityId = new Map(
    postureSnapshot.cityStates.map((cityState) => [cityState.cityId, cityState]),
  );
  const updatedBaseStates: Record<string, BaseDirectorState> = { ...state.baseStates };
  let updatedEnemyPlatforms = enemyPlatforms.map(clonePlatform);
  const effectiveActiveEnemyCap = Math.min(
    profile.activeEnemyCap,
    Math.max(
      enemyBases.length,
      postureSnapshot.recommendedActiveCount +
        (profile.tier === "surge" ? 1 : 0),
    ),
  );
  let availableSlots = Math.max(
    0,
    effectiveActiveEnemyCap -
      updatedEnemyPlatforms.filter((platform) => isPlatformDeployed(platform)).length,
  );
  const recentLaunches = [...state.snapshot.recentLaunches];

  for (const [baseIndex, enemyBase] of enemyBases.entries()) {
    if (availableSlots <= 0) {
      break;
    }

    const baseState = getOrCreateBaseState(state, enemyBase.id, baseIndex);
    if (isEnemyBaseDeploymentDisabled(debugSettings, enemyBase.id)) {
      updatedBaseStates[enemyBase.id] = baseState;
      continue;
    }

    if (tick < baseState.nextLaunchTick) {
      updatedBaseStates[enemyBase.id] = baseState;
      continue;
    }

    const storedPlatforms = updatedEnemyPlatforms.filter(
      (platform) =>
        platform.originId === enemyBase.id &&
        isPlatformStored(platform) &&
        !isPlatformDestroyed(platform) &&
        platform.deploymentDelaySeconds >= ENEMY_DEPLOYMENT_HOLD_SECONDS * 0.5,
    );
    if (storedPlatforms.length === 0) {
      updatedBaseStates[enemyBase.id] = baseState;
      continue;
    }

    const assignmentDrivenPlatforms = storedPlatforms
      .map((platform) => ({
        platform,
        assignment: enemyAssignmentsByResourceId.get(platform.id),
      }))
      .filter(
        (
          entry,
        ): entry is { platform: MobilePlatform; assignment: ResourceAssignment } =>
          Boolean(entry.assignment),
      )
      .slice(0, Math.max(1, Math.min(availableSlots, profile.maxWaveSize)));

    const targetCityExposure = selectTargetCity(enemyBase, baseState, alliedCities, cityExposureScores);
    if (!targetCityExposure && assignmentDrivenPlatforms.length === 0) {
      updatedBaseStates[enemyBase.id] = baseState;
      continue;
    }

    const targetCityPosture = targetCityExposure
      ? postureByCityId.get(targetCityExposure.cityId)
      : undefined;
    if (
      postureSnapshot.recallPressureActive &&
      !postureSnapshot.launchReleaseActive &&
      (targetCityPosture?.unmetPressure ?? 0) < 1.9
    ) {
      updatedBaseStates[enemyBase.id] = {
        ...baseState,
        nextLaunchTick: tick + Math.max(6, Math.floor(profile.intervalTicks / 2)),
      };
      continue;
    }

    const waveSize = getWaveSize(profile, baseState, tick, availableSlots, storedPlatforms.length);
    const demandLimitedWaveSize = targetCityExposure
      ? Math.max(1, Math.ceil((targetCityPosture?.unmetPressure ?? targetCityExposure.exposure) / 1.85))
      : waveSize;
    const selectedPlatforms = assignmentDrivenPlatforms.length > 0
      ? assignmentDrivenPlatforms.map((entry) => entry.platform).slice(0, Math.min(waveSize, demandLimitedWaveSize))
      : targetCityExposure
        ? selectPlatformsForWave(
            storedPlatforms,
            profile,
            Math.min(waveSize, demandLimitedWaveSize),
            targetCityExposure,
          )
        : [];
    if (selectedPlatforms.length === 0) {
      updatedBaseStates[enemyBase.id] = {
        ...baseState,
        nextLaunchTick: tick + Math.max(6, Math.floor(profile.intervalTicks / 2)),
      };
      continue;
    }

    const launchOrders = new Map(
      selectedPlatforms.map((platform, waveIndex) => {
        const plannedAssignment = enemyAssignmentsByResourceId.get(platform.id);
        const assignedTargetId = plannedAssignment?.targetId;
        const resolvedTargetId =
          assignedTargetId && alliedPlatforms.some((candidate) => candidate.id === assignedTargetId)
            ? assignedTargetId
            : targetCityExposure?.cityId;
        return [
          platform.id,
          {
            delay: getWaveDelaySeconds(baseIndex, waveIndex),
            targetId: resolvedTargetId,
          },
        ];
      }),
    );

    updatedEnemyPlatforms = updatedEnemyPlatforms.map((platform) => {
      const launchOrder = launchOrders.get(platform.id);
      if (!launchOrder) {
        return platform;
      }

      if (!launchOrder.targetId) {
        return platform;
      }

      return {
        ...platform,
        targetId: launchOrder.targetId,
        deploymentDelaySeconds: launchOrder.delay,
      };
    });

    availableSlots -= selectedPlatforms.length;
    updatedBaseStates[enemyBase.id] = {
      nextLaunchTick:
        tick + getNextLaunchIntervalTicks(profile, baseIndex, selectedPlatforms.length),
      launchesIssued: baseState.launchesIssued + selectedPlatforms.length,
      lastTargetCityId:
        targetCityExposure?.cityId ??
        enemyAssignmentsByResourceId.get(selectedPlatforms[0]?.id ?? "")?.targetId,
    };
    const launchLead =
      assignmentDrivenPlatforms.length > 0
        ? "Shared decision engine launched"
        : `${enemyBase.name ?? enemyBase.id} launched`;
    recentLaunches.unshift(
      targetCityExposure
        ? `${launchLead} ${getWaveSummary(selectedPlatforms)} toward ` +
          `${targetCityExposure.cityName}. ${getLaunchReason(targetCityExposure)} ` +
          `${postureSnapshot.summary}`
        : `${launchLead} ${getWaveSummary(selectedPlatforms)} on planner-selected intercept tracks. ` +
          `${postureSnapshot.summary}`,
    );
  }

  const activeEnemyCount = updatedEnemyPlatforms.filter((platform) =>
    isPlatformDeployed(platform),
  ).length;

  return {
    enemyPlatforms: updatedEnemyPlatforms,
    directorState: {
        baseStates: updatedBaseStates,
        postureMemory: posture.memory,
        allocationPostureMemory: decisionAllocation.postureMemory,
        snapshot: {
          aggressionTier: profile.tier,
          aggressionLabel: profile.label,
        aggressionPercent: profile.aggressionPercent,
        activeEnemyCount,
        activeEnemyCap: effectiveActiveEnemyCap,
        postureSnapshot,
        cityExposureScores: cityExposureScores.slice(0, 3),
        recentLaunches: recentLaunches.slice(0, maxRecentLaunches),
      },
    },
  };
}
