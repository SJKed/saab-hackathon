import type { ResourceAssignment } from "../engine/allocation";
import type { EnemyDirectorSnapshot } from "../engine/enemy-director";
import type {
  AlliedCity,
  AlliedSpawnZone,
  EnemyBase,
  MobilePlatform,
} from "../models/entity";
import {
  cloneDebugSettings,
  defaultDebugSettings,
  type DebugSettings,
  type EnemyAggressionOverride,
  type RadarDetectorType,
} from "../models/debug";
import { isPlatformDeployed, isPlatformStored } from "../models/platform-utils";

type DebugMenuApi = {
  root: HTMLElement;
  getState: () => DebugSettings;
  update: (input: {
    alliedCities: AlliedCity[];
    alliedSpawnZones: AlliedSpawnZone[];
    enemyBases: EnemyBase[];
    alliedPlatforms: MobilePlatform[];
    enemyPlatforms: MobilePlatform[];
    assignments: ResourceAssignment[];
    directorSnapshot: EnemyDirectorSnapshot;
  }) => void;
};

type BaseToggleRow = {
  root: HTMLLabelElement;
  checkbox: HTMLInputElement;
  meta: HTMLSpanElement;
};

const radarDetectorOptions: Array<{
  type: RadarDetectorType;
  label: string;
}> = [
  { type: "fixedRadar", label: "Fixed radar" },
  { type: "fighterJet", label: "Fighter radar" },
  { type: "drone", label: "Drone sensors" },
  { type: "ballisticMissile", label: "Ballistic missile sensors" },
];

function setStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(element.style, styles);
}

function createSection(title: string, subtitle: string): HTMLElement {
  const section = document.createElement("section");
  setStyles(section, {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  });

  const header = document.createElement("div");
  const titleElement = document.createElement("strong");
  titleElement.textContent = title;
  setStyles(titleElement, {
    color: "#f5f5f5",
    fontSize: "13px",
    lineHeight: "1.2",
  });
  const subtitleElement = document.createElement("div");
  subtitleElement.textContent = subtitle;
  setStyles(subtitleElement, {
    color: "#8fa8b1",
    fontSize: "11px",
    lineHeight: "1.3",
  });
  header.appendChild(titleElement);
  header.appendChild(subtitleElement);
  section.appendChild(header);

  return section;
}

function createToggleRow(label: string): BaseToggleRow {
  const row = document.createElement("label");
  setStyles(row, {
    display: "grid",
    gridTemplateColumns: "18px minmax(0, 1fr)",
    gap: "8px",
    alignItems: "start",
    padding: "8px",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "7px",
    background: "rgba(255, 255, 255, 0.04)",
    cursor: "pointer",
  });

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = true;
  checkbox.style.margin = "2px 0 0";
  row.appendChild(checkbox);

  const textGroup = document.createElement("div");
  setStyles(textGroup, {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    minWidth: "0",
  });
  const labelElement = document.createElement("span");
  labelElement.textContent = label;
  setStyles(labelElement, {
    color: "#e5eef2",
    fontSize: "12px",
    fontWeight: "600",
    overflowWrap: "anywhere",
  });
  const meta = document.createElement("span");
  setStyles(meta, {
    color: "#8fa8b1",
    fontSize: "11px",
    lineHeight: "1.25",
  });
  textGroup.appendChild(labelElement);
  textGroup.appendChild(meta);
  row.appendChild(textGroup);

  return { root: row, checkbox, meta };
}

function createSliderRow(
  label: string,
  min: number,
  max: number,
  step: number,
  initialValue: number,
  formatter: (value: number) => string,
): {
  root: HTMLDivElement;
  slider: HTMLInputElement;
  valueLabel: HTMLSpanElement;
} {
  const row = document.createElement("div");
  setStyles(row, {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  });
  const labelRow = document.createElement("div");
  setStyles(labelRow, {
    display: "flex",
    justifyContent: "space-between",
    gap: "8px",
    alignItems: "baseline",
  });
  const labelElement = document.createElement("label");
  labelElement.textContent = label;
  setStyles(labelElement, {
    color: "#e0e0e0",
    fontSize: "12px",
  });
  const valueLabel = document.createElement("span");
  valueLabel.textContent = formatter(initialValue);
  setStyles(valueLabel, {
    color: "#b8c7cc",
    fontSize: "11px",
  });
  labelRow.appendChild(labelElement);
  labelRow.appendChild(valueLabel);
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(initialValue);
  row.appendChild(labelRow);
  row.appendChild(slider);

  return { root: row, slider, valueLabel };
}

function createSummaryCard(
  title: string,
  body: string,
  tone: "low" | "medium" | "high" = "low",
): HTMLDivElement {
  const card = document.createElement("div");
  const color =
    tone === "high" ? "#ff6b6b" : tone === "medium" ? "#ffd166" : "#74d680";
  setStyles(card, {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "8px",
    border: `1px solid ${color}33`,
    borderRadius: "7px",
    background: "rgba(16, 36, 42, 0.48)",
  });
  const titleElement = document.createElement("div");
  titleElement.textContent = title;
  setStyles(titleElement, {
    color,
    fontSize: "11px",
    fontWeight: "700",
  });
  const bodyElement = document.createElement("div");
  bodyElement.textContent = body;
  setStyles(bodyElement, {
    color: "#dfe9ec",
    fontSize: "12px",
    lineHeight: "1.3",
    overflowWrap: "anywhere",
  });
  card.appendChild(titleElement);
  card.appendChild(bodyElement);
  return card;
}

export function createDebugMenu(container: HTMLElement): DebugMenuApi {
  const state = cloneDebugSettings(defaultDebugSettings);
  let isCollapsed = false;

  const panel = document.createElement("aside");
  setStyles(panel, {
    position: "absolute",
    top: "48px",
    left: "16px",
    width: "320px",
    maxHeight: "min(78vh, 820px)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "12px",
    overflowY: "auto",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    borderRadius: "8px",
    background: "rgba(8, 20, 24, 0.92)",
    backdropFilter: "blur(2px)",
    fontFamily: "Arial, sans-serif",
  });

  const header = document.createElement("div");
  setStyles(header, {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
  });

  const title = document.createElement("strong");
  title.textContent = "Debug Menu";
  setStyles(title, {
    color: "#f5f5f5",
    fontSize: "14px",
  });
  header.appendChild(title);

  const collapseButton = document.createElement("button");
  collapseButton.type = "button";
  setStyles(collapseButton, {
    padding: "5px 8px",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    borderRadius: "6px",
    background: "rgba(255, 255, 255, 0.05)",
    color: "#dfe9ec",
    fontSize: "11px",
    cursor: "pointer",
  });
  header.appendChild(collapseButton);
  panel.appendChild(header);

  const subtitle = document.createElement("div");
  subtitle.textContent =
    "Live overrides for deployments, combat tuning, fuel burn, and launch behavior.";
  setStyles(subtitle, {
    color: "#9fb6be",
    fontSize: "11px",
    lineHeight: "1.35",
  });

  const content = document.createElement("div");
  setStyles(content, {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  });
  content.appendChild(subtitle);

  const deploymentsSection = createSection(
    "Deployments",
    "Disable launch waves or scramble from specific bases without pausing the whole simulation.",
  );
  const alliedBaseList = document.createElement("div");
  setStyles(alliedBaseList, {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  });
  const enemyBaseList = document.createElement("div");
  setStyles(enemyBaseList, {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  });
  const alliedHeader = document.createElement("div");
  alliedHeader.textContent = "Allied base launches";
  setStyles(alliedHeader, { color: "#c8d7dc", fontSize: "11px", fontWeight: "700" });
  const enemyHeader = document.createElement("div");
  enemyHeader.textContent = "Enemy base deployments";
  setStyles(enemyHeader, { color: "#c8d7dc", fontSize: "11px", fontWeight: "700" });
  deploymentsSection.appendChild(alliedHeader);
  deploymentsSection.appendChild(alliedBaseList);
  deploymentsSection.appendChild(enemyHeader);
  deploymentsSection.appendChild(enemyBaseList);
  content.appendChild(deploymentsSection);

  const radarSection = createSection(
    "Radar and sensors",
    "Disable specific detector types without despawning the units or changing rendering geometry.",
  );
  const radarList = document.createElement("div");
  setStyles(radarList, {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  });
  radarSection.appendChild(radarList);
  content.appendChild(radarSection);

  const tuningSection = createSection(
    "Combat and fuel",
    "Scale damage and fuel burn globally to stress-test balance assumptions quickly.",
  );
  const alliedDamageRow = createSliderRow(
    "Allied damage",
    0,
    3,
    0.1,
    state.alliedDamageMultiplier,
    (value) => `${value.toFixed(1)}x`,
  );
  alliedDamageRow.slider.addEventListener("input", () => {
    state.alliedDamageMultiplier = Number(alliedDamageRow.slider.value);
    alliedDamageRow.valueLabel.textContent =
      `${state.alliedDamageMultiplier.toFixed(1)}x`;
  });
  const enemyDamageRow = createSliderRow(
    "Enemy damage",
    0,
    3,
    0.1,
    state.enemyDamageMultiplier,
    (value) => `${value.toFixed(1)}x`,
  );
  enemyDamageRow.slider.addEventListener("input", () => {
    state.enemyDamageMultiplier = Number(enemyDamageRow.slider.value);
    enemyDamageRow.valueLabel.textContent =
      `${state.enemyDamageMultiplier.toFixed(1)}x`;
  });
  const fuelBurnRow = createSliderRow(
    "Fuel burn",
    0,
    3,
    0.1,
    state.fuelBurnMultiplier,
    (value) => `${value.toFixed(1)}x`,
  );
  fuelBurnRow.slider.addEventListener("input", () => {
    state.fuelBurnMultiplier = Number(fuelBurnRow.slider.value);
    fuelBurnRow.valueLabel.textContent = `${state.fuelBurnMultiplier.toFixed(1)}x`;
  });
  tuningSection.appendChild(alliedDamageRow.root);
  tuningSection.appendChild(enemyDamageRow.root);
  tuningSection.appendChild(fuelBurnRow.root);
  content.appendChild(tuningSection);

  const aiSection = createSection(
    "Enemy aggression",
    "Override the enemy launch posture for balance checks and scripted demos.",
  );
  const aggressionSelect = document.createElement("select");
  setStyles(aggressionSelect, {
    padding: "7px 8px",
    background: "#10242a",
    color: "#f5f5f5",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "6px",
  });
  const aggressionOptions: EnemyAggressionOverride[] = [
    "auto",
    "opening",
    "pressure",
    "surge",
  ];
  for (const optionValue of aggressionOptions) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent =
      optionValue === "auto"
        ? "Auto"
        : optionValue[0].toUpperCase() + optionValue.slice(1);
    aggressionSelect.appendChild(option);
  }
  aggressionSelect.value = state.enemyAggressionOverride;
  aggressionSelect.addEventListener("change", () => {
    state.enemyAggressionOverride =
      aggressionSelect.value as EnemyAggressionOverride;
  });
  aiSection.appendChild(aggressionSelect);
  content.appendChild(aiSection);

  const summarySection = createSection(
    "Base allocation snapshot",
    "Read-only view of how many allied resources each base currently has assigned or airborne.",
  );
  const summaryList = document.createElement("div");
  setStyles(summaryList, {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  });
  summarySection.appendChild(summaryList);
  content.appendChild(summarySection);
  panel.appendChild(content);

  function syncCollapsedState(): void {
    collapseButton.textContent = isCollapsed ? "Expand" : "Collapse";
    collapseButton.setAttribute("aria-expanded", String(!isCollapsed));
    content.style.display = isCollapsed ? "none" : "flex";
  }

  collapseButton.addEventListener("click", () => {
    isCollapsed = !isCollapsed;
    syncCollapsedState();
  });
  syncCollapsedState();

  container.style.position = "relative";
  container.appendChild(panel);

  const alliedBaseRows = new Map<string, BaseToggleRow>();
  const enemyBaseRows = new Map<string, BaseToggleRow>();
  const radarRows = new Map<RadarDetectorType, BaseToggleRow>();

  function syncBaseRows(
    bases: Array<{ id: string; label: string }>,
    rows: Map<string, BaseToggleRow>,
    disabledIds: string[],
    parent: HTMLElement,
    onToggle: (baseId: string, enabled: boolean) => void,
  ): void {
    for (const base of bases) {
      let row = rows.get(base.id);
      if (!row) {
        row = createToggleRow(base.label);
        row.checkbox.addEventListener("change", () => {
          onToggle(base.id, row?.checkbox.checked ?? true);
        });
        rows.set(base.id, row);
        parent.appendChild(row.root);
      }

      row.checkbox.checked = !disabledIds.includes(base.id);
    }
  }

  return {
    root: panel,
    getState: () => cloneDebugSettings(state),
    update: (input) => {
      syncBaseRows(
        input.alliedSpawnZones.map((base) => ({
          id: base.id,
          label: base.name ?? base.id,
        })),
        alliedBaseRows,
        state.disabledAlliedBaseIds,
        alliedBaseList,
        (baseId, enabled) => {
          state.disabledAlliedBaseIds = enabled
            ? state.disabledAlliedBaseIds.filter((id) => id !== baseId)
            : [...state.disabledAlliedBaseIds, baseId];
        },
      );
      syncBaseRows(
        input.enemyBases.map((base) => ({
          id: base.id,
          label: base.name ?? base.id,
        })),
        enemyBaseRows,
        state.disabledEnemyBaseIds,
        enemyBaseList,
        (baseId, enabled) => {
          state.disabledEnemyBaseIds = enabled
            ? state.disabledEnemyBaseIds.filter((id) => id !== baseId)
            : [...state.disabledEnemyBaseIds, baseId];
        },
      );

      for (const zone of input.alliedSpawnZones) {
        const row = alliedBaseRows.get(zone.id);
        if (!row) {
          continue;
        }

        const basePlatforms = input.alliedPlatforms.filter(
          (platform) => platform.originId === zone.id,
        );
        const assignedCount = input.assignments.filter((assignment) => {
          const platform = input.alliedPlatforms.find(
            (candidate) => candidate.id === assignment.resourceId,
          );
          return platform?.originId === zone.id;
        }).length;
        const storedCount = basePlatforms.filter(isPlatformStored).length;
        const airborneCount = basePlatforms.filter(isPlatformDeployed).length;
        row.meta.textContent =
          `${storedCount} stored | ${airborneCount} airborne | ${assignedCount} assigned`;
      }

      for (const base of input.enemyBases) {
        const row = enemyBaseRows.get(base.id);
        if (!row) {
          continue;
        }

        const basePlatforms = input.enemyPlatforms.filter(
          (platform) => platform.originId === base.id,
        );
        const storedCount = basePlatforms.filter(isPlatformStored).length;
        const airborneCount = basePlatforms.filter(isPlatformDeployed).length;
        row.meta.textContent =
          `${storedCount} stored | ${airborneCount} active | ` +
          `${input.directorSnapshot.aggressionLabel}`;
      }

      for (const option of radarDetectorOptions) {
        let row = radarRows.get(option.type);
        if (!row) {
          row = createToggleRow(option.label);
          row.checkbox.addEventListener("change", () => {
            state.disabledRadarTypes = row?.checkbox.checked
              ? state.disabledRadarTypes.filter((type) => type !== option.type)
              : [...state.disabledRadarTypes, option.type];
          });
          radarRows.set(option.type, row);
          radarList.appendChild(row.root);
        }

        row.checkbox.checked = !state.disabledRadarTypes.includes(option.type);
        if (option.type === "fixedRadar") {
          row.meta.textContent =
            `${input.alliedCities.length + input.alliedSpawnZones.length} fixed sources`;
          continue;
        }

        const activeDetectors = input.alliedPlatforms.filter(
          (platform) =>
            platform.platformClass === option.type &&
            isPlatformDeployed(platform) &&
            (platform.role === "recon" || platform.sensors.sensorType === "radar"),
        ).length;
        const storedDetectors = input.alliedPlatforms.filter(
          (platform) =>
            platform.platformClass === option.type &&
            isPlatformStored(platform) &&
            (platform.role === "recon" || platform.sensors.sensorType === "radar"),
        ).length;
        row.meta.textContent =
          `${activeDetectors} active detector${activeDetectors === 1 ? "" : "s"} | ` +
          `${storedDetectors} stored`;
      }

      summaryList.replaceChildren();
      const alliedPlatformById = new Map(
        input.alliedPlatforms.map((platform) => [platform.id, platform]),
      );
      for (const zone of input.alliedSpawnZones) {
        const assignments = input.assignments.filter((assignment) => {
          const platform = alliedPlatformById.get(assignment.resourceId);
          return platform?.originId === zone.id;
        });
        const interceptCount = assignments.filter(
          (assignment) => assignment.mission === "intercept",
        ).length;
        const reinforceCount = assignments.length - interceptCount;
        const isDisabled = state.disabledAlliedBaseIds.includes(zone.id);
        summaryList.appendChild(
          createSummaryCard(
            zone.name ?? zone.id,
            `${assignments.length} assigned (${interceptCount} intercept, ${reinforceCount} reinforce)`,
            isDisabled ? "high" : assignments.length > 0 ? "medium" : "low",
          ),
        );
      }
      summaryList.appendChild(
        createSummaryCard(
          "Enemy launch posture",
          `${input.directorSnapshot.aggressionLabel} (${input.directorSnapshot.aggressionPercent}%)`,
          input.directorSnapshot.aggressionTier === "surge"
            ? "high"
            : input.directorSnapshot.aggressionTier === "pressure"
              ? "medium"
              : "low",
        ),
      );
    },
  };
}
