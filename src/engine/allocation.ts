import type { Base, Resource } from "../models/entity";

export type ResourceAssignment = {
  baseId: string;
  baseName: string;
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
  return resource.available && resource.cooldown <= 0;
}

export function allocateResources(bases: Base[], resources: Resource[]): AllocationResult {
  const sortedBases = [...bases].sort((a, b) => b.threat - a.threat);
  const mutableResources = resources.map((resource) => ({ ...resource }));
  const assignments: ResourceAssignment[] = [];

  for (const base of sortedBases) {
    const priorityScore = base.value * base.threat;
    let bestResourceIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < mutableResources.length; i += 1) {
      const resource = mutableResources[i];
      if (!isResourceAvailable(resource)) {
        continue;
      }

      const distance = distanceBetween(resource.position, base.position);
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
      baseId: base.id,
      baseName: base.name ?? base.id,
      resourceId: selectedResource.id,
      resourceName: selectedResource.name ?? selectedResource.id,
      distance: bestDistance,
      threatScore: base.threat,
      priorityScore,
      reason: "Closest available resource assigned to the highest-threat base.",
    });
  }

  return {
    assignments,
    resources: mutableResources,
  };
}
