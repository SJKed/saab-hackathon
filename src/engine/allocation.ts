import type { AlliedCity, AlliedSpawnZone, Enemy, Resource } from "../models/entity";
import { predictIntercept } from "./intercept";

export type ResourceMission = "intercept" | "reinforce" | "reload";

export type ResourceAssignment = {
  mission: ResourceMission;
  targetId: string;
  targetName: string;
  resourceId: string;
  resourceName: string;
  distance: number;
  threatScore: number;
  priorityScore: number;
  reason: string;
};

export type AllocationResult = {
  assignments: ResourceAssignment[];
  resources: Resource[];
};

function distanceBetween(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function isResourceAvailable(resource: Resource): boolean {
  return resource.available && resource.cooldown <= 0 && resource.ordnance > 0;
}

function canIntercept(resource: Resource): boolean {
  return resource.type === "air-defense" || resource.type === "drone";
}

function getCityById(cities: AlliedCity[], cityId: string | undefined): AlliedCity | undefined {
  if (!cityId) {
    return undefined;
  }

  return cities.find((city) => city.id === cityId);
}

function getInterceptPriority(enemy: Enemy, cities: AlliedCity[]): number {
  const targetCity = getCityById(cities, enemy.targetId);
  const targetValue = targetCity?.value ?? 5;
  return enemy.threatLevel * targetValue;
}

function getReinforcementPriority(city: AlliedCity): number {
  return city.value * (1 + city.threat * 100);
}

export function allocateResources(
  cities: AlliedCity[],
  alliedSpawnZones: AlliedSpawnZone[],
  resources: Resource[],
  enemies: Enemy[],
): AllocationResult {
  const mutableResources = resources.map((resource) => ({ ...resource }));
  const assignments: ResourceAssignment[] = [];
  const sortedEnemies = [...enemies].sort(
    (a, b) => getInterceptPriority(b, cities) - getInterceptPriority(a, cities),
  );

  for (let i = 0; i < mutableResources.length; i += 1) {
    const resource = mutableResources[i];
    if (resource.ordnance > 0) {
      continue;
    }

    const reloadBase = alliedSpawnZones.find((base) => base.id === resource.originSpawnZoneId);
    if (!reloadBase) {
      continue;
    }

    mutableResources[i] = {
      ...resource,
      available: false,
      reloadTargetBaseId: reloadBase.id,
    };

    assignments.push({
      mission: "reload",
      targetId: reloadBase.id,
      targetName: reloadBase.name ?? reloadBase.id,
      resourceId: resource.id,
      resourceName: resource.name ?? resource.id,
      distance: distanceBetween(resource.position, reloadBase.position),
      threatScore: 0,
      priorityScore: 999,
      reason: "Asset is out of ordnance and is explicitly routed to a base for reloading.",
    });
  }

  for (const enemy of sortedEnemies) {
    const priorityScore = getInterceptPriority(enemy, cities);
    let bestResourceIndex = -1;
    let bestInterceptDistance = Number.POSITIVE_INFINITY;
    let bestInterceptTime = Number.POSITIVE_INFINITY;

    for (let i = 0; i < mutableResources.length; i += 1) {
      const resource = mutableResources[i];
      if (!isResourceAvailable(resource) || !canIntercept(resource)) {
        continue;
      }

      const intercept = predictIntercept(resource, enemy, cities);
      if (!intercept?.feasibleBeforeImpact) {
        continue;
      }

      if (intercept.timeToIntercept < bestInterceptTime) {
        bestInterceptTime = intercept.timeToIntercept;
        bestInterceptDistance = intercept.distance;
        bestResourceIndex = i;
      }
    }

    if (bestResourceIndex < 0) {
      continue;
    }

    const selectedResource = mutableResources[bestResourceIndex];
    mutableResources[bestResourceIndex] = {
      ...selectedResource,
      available: false,
    };

    assignments.push({
      mission: "intercept",
      targetId: enemy.id,
      targetName: enemy.name ?? enemy.id,
      resourceId: selectedResource.id,
      resourceName: selectedResource.name ?? selectedResource.id,
      distance: bestInterceptDistance,
      threatScore: enemy.threatLevel,
      priorityScore,
      reason: "Predicted intercept trajectory reaches the enemy resource before it can reach an allied city.",
    });
  }

  const sortedCities = [...cities].sort(
    (a, b) => getReinforcementPriority(b) - getReinforcementPriority(a),
  );

  for (const city of sortedCities) {
    const priorityScore = getReinforcementPriority(city);
    let bestResourceIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < mutableResources.length; i += 1) {
      const resource = mutableResources[i];
      if (!isResourceAvailable(resource)) {
        continue;
      }

      const distance = distanceBetween(resource.position, city.position);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestResourceIndex = i;
      }
    }

    if (bestResourceIndex < 0) {
      continue;
    }

    const selectedResource = mutableResources[bestResourceIndex];
    mutableResources[bestResourceIndex] = {
      ...selectedResource,
      available: false,
    };

    assignments.push({
      mission: "reinforce",
      targetId: city.id,
      targetName: city.name ?? city.id,
      resourceId: selectedResource.id,
      resourceName: selectedResource.name ?? selectedResource.id,
      distance: bestDistance,
      threatScore: city.threat,
      priorityScore,
      reason: "Remaining available resource deployed to reinforce a high-priority allied city.",
    });
  }

  return {
    assignments,
    resources: mutableResources,
  };
}
