import type { MetricsSnapshot } from "./metrics";
import type { MissionStatus } from "./mission-evaluator";
import type { CombatLogEvent } from "./combat";

export type ReplayFrame = {
  tick: number;
  metrics: MetricsSnapshot;
  mission: MissionStatus;
};

export type ReplayEvent = {
  tick: number;
  message: string;
};

export type ReplayStore = {
  frames: ReplayFrame[];
  events: ReplayEvent[];
};

export function createReplayStore(): ReplayStore {
  return {
    frames: [],
    events: [],
  };
}

export function appendReplayFrame(
  replay: ReplayStore,
  frame: ReplayFrame,
  interval: number,
): ReplayStore {
  if (frame.tick % Math.max(1, interval) !== 0 && frame.mission.outcome === "inProgress") {
    return replay;
  }

  return {
    ...replay,
    frames: [...replay.frames, frame].slice(-1200),
  };
}

export function appendReplayEvents(
  replay: ReplayStore,
  events: CombatLogEvent[],
): ReplayStore {
  if (events.length === 0) {
    return replay;
  }

  const mapped = events.map((event) => ({
    tick: event.tick,
    message: event.message,
  }));
  return {
    ...replay,
    events: [...mapped, ...replay.events].slice(0, 250),
  };
}
