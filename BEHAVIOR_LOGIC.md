# Behavior Logic

This document explains how the current simulation evaluates threats, decides how to respond, and resolves combat.

It is intentionally split into:

1. **Abstract behavior** - what the subsystem is trying to do.
2. **Mathematical behavior** - the actual scores, weights, thresholds, and transitions in the current implementation.
3. **Code references** - where the logic lives in the repository.

This is a description of the **current implementation**, not a separate formal spec.

---

## 1. System overview

At a high level, the simulation loop behaves like:

```text
enemy deployments are coordinated
-> enemies move
-> allied resources are allocated
-> allied resources move
-> combat resolves
-> city threat is recomputed
```

The main orchestration path is:

- `src/app/simulation-step.ts` -> `advanceSimulation(...)`
- `src/engine/enemy-director.ts` -> `coordinateEnemyDeployments(...)`
- `src/engine/allocation.ts` -> `allocateResources(...)`
- `src/engine/combat.ts` -> `resolveCombat(...)`
- `src/engine/threat.ts` -> `calculateThreatsForCities(...)`

Conceptually:

- **Threat assessment** answers: *How dangerous is the current enemy picture to each allied city?*
- **Response logic** answers: *Which allied units should launch or stay airborne, and where should enemy pressure be concentrated?*
- **Combat logic** answers: *Once units meet, how do they maneuver, fire, hit, miss, damage, disengage, and die?*

---

## 2. Threat assessment

### 2.1 Abstract behavior

Threat assessment is city-centric.

Each allied city receives a scalar threat value based on all currently deployed enemy platforms. The closer and more dangerous an enemy is, the more it contributes. Ballistic missiles are weighted more heavily than other enemy types.

This threat value is later reused by the response layer when deciding reinforcement priority.

### 2.2 Mathematical behavior

Threat is defined in `src/engine/threat.ts`.

For a city `c`, total threat is:

```text
Threat(c) = sum over deployed enemy platforms e of Contribution(e, c)
```

Where:

```text
Contribution(e, c) = (e.threatLevel * strikeWeight(e)) / max(distance(e, c), 1)
```

And:

```text
strikeWeight(e) =
  1.35  if e.platformClass == ballisticMissile
  1.00  otherwise
```

Notes:

- only **deployed** enemy platforms contribute
- the divisor is clamped with `max(distance, 1)` to avoid singular behavior at very short range
- this is a simple inverse-distance model, not a probabilistic forecast

### 2.3 Code references

- `src/engine/threat.ts`
  - `calculateCityThreat(...)`
  - `calculateThreatsForCities(...)`

---

## 3. Response logic

Response logic has three main parts:

1. **Allied allocation** - which allied units intercept or reinforce.
2. **Team posture** - whether each side should surge, balance, or stand down.
3. **Enemy director** - how enemy bases choose launch timing, target cities, and wave size.

---

## 4. Allied response logic

### 4.1 Abstract behavior

The allied side performs two passes:

1. assign interceptors against active enemy platforms
2. assign reinforcement/patrol coverage over threatened cities

The allocator does not only ask whether a unit *can* help. It also asks whether launching or keeping it airborne is worth the reserve cost and posture pressure.

### 4.2 Intercept priority

Enemy intercept priority is:

```text
InterceptPriority(enemy) = enemy.threatLevel * targetCityValue * payloadThreat
```

Where:

```text
payloadThreat =
  1.35  if enemy.platformClass == ballisticMissile
  1.00  otherwise
```

If the target city is missing, `targetCityValue = 5`.

This makes high-threat units aimed at high-value cities rise to the top.

### 4.3 Reinforcement priority

Reinforcement priority for an allied city is:

```text
ReinforcementPriority(city) = city.value * (1 + city.threat * 95)
```

This is intentionally aggressive: even small threat values become operationally meaningful once multiplied by `95`.

### 4.4 Weapon effectiveness for allied intercept selection

For a reusable allied weapon against an enemy platform:

```text
signatureModifier = 0.65 + enemy.signature * 0.4
evasionModifier   = max(0.22, 1 - enemy.evasion * 0.52)
trackingModifier  = 0.72 + allied.trackingQuality * 0.35
interceptPenalty  = 1 - enemy.interceptDifficulty * 0.45   (ballistic missiles only)
```

Then:

```text
hitChance =
  clamp(
    weapon.accuracy
    * weapon.probabilityOfKillBase
    * signatureModifier
    * evasionModifier
    * trackingModifier
    * interceptPenalty,
    0.10,
    0.98
  )
```

```text
damageWeight =
  (weapon.damagePerHit * salvoSize) / max(40, enemy.maxDurability)
```

```text
WeaponEffectiveness = hitChance * min(1.4, damageWeight + 0.35)
```

This is not a full combat simulation. It is a planning-time proxy used to rank assignment options.

### 4.5 One-way terminal impact effectiveness

For one-way allied interceptors:

```text
damageWeight        = (warheadDamage * 1.2) / max(40, enemy.maxDurability)
terminalModifier    = 1.18 vs ballistic missile, 1.06 vs fighter, else 1.00
survivabilityFactor = 0.76 + (1 - enemy.evasion * 0.4) * 0.24
```

```text
TerminalImpactEffectiveness =
  clamp(damageWeight * terminalModifier * survivabilityFactor, 0.45, 1.7)
```

### 4.6 Reserve penalty

Stored allied platforms are penalized if launching them damages reserve posture.

The reserve penalty depends on:

- class-specific reserve floor
- total stored reserve at the origin base
- class type (ballistic missiles are penalized more heavily)

Class floors:

```text
drone            -> 2
fighterJet       -> 1
ballisticMissile -> 1
```

Penalty additions:

- if class reserve is at or below floor:
  - ballistic missile: `+5.0`
  - fighter jet: `+3.4`
  - drone: `+2.4`
- if total stored reserve at origin <= 3: `+3.1`
- if platform class is ballistic missile: `+1.8`

If no reserve record exists:

- ballistic missile: `4.2`
- other classes: `2.8`

### 4.7 Allied intercept score

For a candidate allied platform vs an enemy platform:

```text
InterceptScore =
  priorityScore * 1.3
  + platformEffectiveness * (14 if oneWay else 12)
  + sensorRange / 50
  - interceptTimeSeconds * 1.1
  - reservePenalty
  - launchPressurePenalty
```

Additional hard filters:

- platform must be available
- reusable platform must have a usable weapon for target type
- predicted intercept must be feasible before impact
- acquisition must be feasible
- endurance margin after intercept must exceed `4` seconds

### 4.8 Allied reinforcement score

For a candidate allied platform covering a city:

```text
ReinforcementScore =
  unmetCoverage * 8.5
  + localCoverage * 1.8
  + sensorRange / 65
  + enduranceSeconds / 45
  - distanceToCity / 70
  + city.threat * 18
  + airborneBonus
  - reservePenalty * 1.15
  - launchPressurePenalty
```

Where:

```text
airborneBonus = 1.1 if already airborne else 0.2
```

Additional gating:

- stored platforms may be skipped entirely if posture does not justify more launch activity
- recall pressure suppresses low-value reinforcement launches
- cities with low unmet coverage may be skipped entirely during oversaturation

### 4.9 Code references

- `src/engine/allocation.ts`
  - `getInterceptPriority(...)`
  - `getReinforcementPriority(...)`
  - `getWeaponEffectiveness(...)`
  - `getTerminalImpactEffectiveness(...)`
  - `getReservePenalty(...)`
  - `allocateResources(...)`

---

## 5. Team posture logic

### 5.1 Abstract behavior

Posture logic determines whether a side should:

- **surge** - demand exceeds useful active force
- **balance** - active force roughly matches demand
- **standby** - active force materially exceeds demand

This exists for both teams and acts like a soft force-budget model. It discourages unnecessary launches and helps recover redundant airborne assets.

### 5.2 Shared burden and readiness model

Each platform gets a burden score based on class, endurance, durability, and payload readiness.

Class weights:

```text
fighterJet       -> 1.20
ballisticMissile -> 1.45
drone            -> 0.85
default          -> 1.00
```

Payload readiness:

- `1.0` for one-way platforms
- `0.45` if the platform has no weapons
- otherwise:

```text
PayloadReadiness =
  clamp(totalAmmo / totalMaxAmmo, 0.25, 1.0)
```

Endurance ratio:

```text
EnduranceRatio =
  clamp(enduranceSeconds / maxEnduranceSeconds, 0.2, 1.0)
```

Durability ratio:

```text
DurabilityRatio =
  clamp(durability / maxDurability, 0.35, 1.0)
```

Burden:

```text
BurdenScore =
  classWeight * EnduranceRatio * DurabilityRatio * PayloadReadiness
```

### 5.3 Coverage contribution

Used in both allied and enemy posture scoring:

```text
distanceFactor   = 1 / (1 + distance / distanceScale)
platformStrength = classWeight * (0.52 + sensorRange / 260 + maxDurability / 220)
coverage         = platformStrength * distanceFactor * weightMultiplier
```

### 5.4 Enemy pressure contribution

Enemy pressure against a city is:

```text
proximityFactor = 1 / (1 + distance / 255)
targetBias      = 1.25 if platform.targetId == city.id else 0.55
pressureWeight  =
  threatLevel
  * classWeight
  * max(proximityFactor, 0.85 if directly targeting city else 0)
```

```text
EnemyPressureContribution = pressureWeight * targetBias
```

### 5.5 Allied city posture

For each allied city:

```text
DemandScore =
  city.value * 0.42
  + inboundPressure * 1.85
  + activeThreatCount * 0.55
```

```text
UnmetCoverage = max(0, DemandScore - deployedCoverage)
```

At the team level:

```text
surplusScore           = activeBurdenScore - demandScore
recommendedActiveCount = ceil(demandScore / 2.35), minimum 1
```

Allied stance:

```text
surging  if demandScore > activeBurdenScore + 1.6 OR incursionCount >= 4
standby  if surplusScore > 2.2 AND incursionCount <= 1
balanced otherwise
```

### 5.6 Enemy city posture

For each allied city, from the enemy perspective:

```text
DemandScore =
  (city.value * 0.44 + max(0, 2.9 - alliedCoverage) * 1.35)
  * (0.7 + aggressionMultiplier * 0.8)
```

```text
UnmetPressure = max(0, DemandScore - enemyPressure)
```

At the team level:

```text
surplusScore           = activeBurdenScore - demandScore
recommendedActiveCount = ceil(demandScore / 2.15), minimum 1
```

Enemy stance:

```text
surging  if demandScore > activeBurdenScore + 1.4
standby  if surplusScore > 2.1 AND opportunityCount <= 1
balanced otherwise
```

### 5.7 Hysteresis

Posture is not applied instantly. Instead, a memory object tracks sustained oversupply and sustained demand.

Memory state:

```text
sustainedSurplusSeconds
sustainedDemandSeconds
```

Default persistence thresholds:

```text
recallPersistenceSeconds        = 5.5
launchReleasePersistenceSeconds = 3.25
```

Update rule:

```text
if surplus condition active:
  sustainedSurplusSeconds += deltaSeconds
else:
  sustainedSurplusSeconds = max(0, sustainedSurplusSeconds - 1.5 * deltaSeconds)

if demand condition active:
  sustainedDemandSeconds += deltaSeconds
else:
  sustainedDemandSeconds = max(0, sustainedDemandSeconds - 1.5 * deltaSeconds)
```

Flags:

```text
recallPressureActive = sustainedSurplusSeconds >= 5.5
launchReleaseActive  = sustainedDemandSeconds >= 3.25
```

Allocator-specific thresholds:

- allied surplus threshold: `2.15`
- allied demand-gap threshold: `1.15`

Enemy-director-specific thresholds:

- enemy surplus threshold: `1.9`
- enemy demand-gap threshold: `1.0`

### 5.8 Code references

- `src/engine/posture.ts`
  - `getPlatformBurdenScore(...)`
  - `getCoverageContribution(...)`
  - `getEnemyPressureContribution(...)`
  - `evaluateAlliedForcePosture(...)`
  - `evaluateEnemyForcePosture(...)`
  - `applyPostureMemory(...)`

---

## 6. Enemy deployment logic

### 6.1 Abstract behavior

Enemy bases do not simply launch everything immediately.

They:

1. choose an aggression profile based on elapsed time
2. compute city exposure
3. compute team posture
4. pick the most attractive target city
5. limit wave size by available slots, stored inventory, profile limits, and unmet demand

### 6.2 Aggression tiers

The aggression profile is time-based:

#### Opening Probe (`elapsedSeconds < 28`)

```text
aggressionPercent = 26
activeEnemyCap    = enemyBaseCount + 1
intervalTicks     = 24
maxWaveSize       = 1
missileQuota      = 0
classOrder        = [drone, fighterJet, ballisticMissile]
```

#### Escalating Pressure (`28 <= elapsedSeconds < 72`)

```text
aggressionPercent = 58
activeEnemyCap    = max(enemyBaseCount + 2, enemyBaseCount * 2)
intervalTicks     = 15
maxWaveSize       = 2
missileQuota      = 1
classOrder        = [fighterJet, drone, ballisticMissile]
```

#### Coordinated Surge (`elapsedSeconds >= 72`)

```text
aggressionPercent = 86
activeEnemyCap    = max(enemyBaseCount + 4, enemyBaseCount * 3)
intervalTicks     = 9
maxWaveSize       = 3
missileQuota      = 1
classOrder        = [ballisticMissile, fighterJet, drone]
```

### 6.3 City exposure

Enemy launch targeting still uses city exposure, distinct from the newer posture model.

Per city:

```text
thinCoveragePenalty = max(0, 3.1 - deployedCoverage) * 1.1
thinReservePenalty  = max(0, 2.5 - reserveCoverage) * 1.2
saturationPenalty   = activeThreatCount * 0.28
```

```text
Exposure =
  city.value * 0.42
  + inboundPressure * 1.85
  + thinCoveragePenalty
  + thinReservePenalty
  - saturationPenalty
```

Target-city selection from a base:

```text
score =
  exposure * 1.28
  + proximityBias
  + continuityBonus
  - saturationPenalty
```

Where:

```text
proximityBias    = max(0.22, 1.2 - cityDistance / 980)
continuityBonus  = 0.18 if same target city as previous wave else 0
saturationPenalty = activeThreatCount * 0.35
```

### 6.4 Wave timing and size

Wave delay within a wave:

```text
waveDelaySeconds = baseIndex * 0.08 + waveIndex * 0.62
```

Next launch interval:

```text
nextIntervalTicks = profile.intervalTicks + max(0, 3 - baseIndex) + max(0, launchedCount - 1)
```

Nominal wave size:

```text
overdueBonus = 1 if tick - nextLaunchTick >= intervalTicks else 0
baseWaveSize =
  1 for opening
  2 for pressure
  2 for surge
```

```text
waveSize =
  clamp(baseWaveSize + overdueBonus, 1, min(profile.maxWaveSize, storedCount, availableSlots))
```

Demand-limited wave size:

```text
demandLimitedWaveSize =
  max(1, ceil((targetCityPosture.unmetPressure or targetCityExposure.exposure) / 1.85))
```

The actual desired wave size is:

```text
min(waveSize, demandLimitedWaveSize)
```

### 6.5 Missile quota

Ballistic missiles are only allowed when:

```text
profile.missileQuota > 0
AND (profile.tier == surge OR targetCityExposure.exposure >= 6.9)
```

### 6.6 Effective active cap

The enemy active cap is posture-limited:

```text
effectiveActiveEnemyCap =
  min(profile.activeEnemyCap,
      max(enemyBaseCount,
          postureSnapshot.recommendedActiveCount + (1 if tier == surge else 0)))
```

This means time-based aggression can no longer force a large active swarm when posture logic says current offensive demand is lower.

### 6.7 Launch suppression

Enemy launch is held when:

```text
recallPressureActive == true
AND launchReleaseActive == false
AND targetCityPosture.unmetPressure < 1.9
```

When held, the base delays the next launch attempt by:

```text
max(6, floor(profile.intervalTicks / 2))
```

### 6.8 Code references

- `src/engine/enemy-director.ts`
  - `getAggressionProfile(...)`
  - `getCityExposureBreakdown(...)`
  - `selectTargetCity(...)`
  - `getWaveSize(...)`
  - `selectPlatformsForWave(...)`
  - `coordinateEnemyDeployments(...)`

---

## 7. Combat logic

### 7.1 Abstract behavior

Combat is a phased engagement model rather than simple proximity damage.

Platforms:

- acquire an opponent
- transition through pursuit / attack / evade / reposition / disengage
- fire only in suitable windows
- use deterministic hit and critical rolls
- damage durability or objective health
- clear combat state when disengaging or after destruction

### 7.2 Combat phases and timing constants

Defined in `src/engine/combat.ts`:

```text
attackRunWindowSeconds      = 0.75
repositionWindowSeconds     = 1.10
evadeWindowSeconds          = 0.80
disengageWindowSeconds      = 2.20
enduranceRetreatThreshold   = 14 seconds
durabilityRetreatRatio      = 0.24
lockLossRangeMultiplier     = 1.55
deadlockRelativeSpeedThresh = 9
deadlockDistanceThresh      = 26
orbitTimeoutSeconds         = 1.9
mergeDistanceThreshold      = 18
overshootClosureThreshold   = 6
impactBuffer                = 4
minimumStrikeDistance       = 10
```

### 7.3 Engagement geometry

Relative speed:

```text
RelativeSpeed = magnitude(platform.velocity - target.velocity)
```

Closure rate:

```text
ClosureRate =
  - dot(relativePosition, relativeVelocity) / distance
```

Deadlock condition:

```text
distance <= max(deadlockDistanceThreshold, preferredRange * 0.9)
AND relativeSpeed <= 9
AND platformSpeed <= 9
AND targetSpeed <= 9
```

Merge / overshoot condition:

```text
distance <= max(mergeDistanceThreshold, preferredRange * 0.72)
AND closureRate <= 6
```

Pressing-side asymmetry:

Each platform gets an engagement role score:

```text
roleScore =
  1.25 for interceptor
  1.10 for strike
  0.90 for patrol
  0.72 otherwise
```

Plus class and threat bias:

```text
classScore =
  0.28 for fighterJet
  0.12 for drone
  0.00 otherwise
```

```text
EngagementRoleScore = roleScore + classScore + threatLevel * 0.22
```

The higher-scoring side is treated as the one pressing the attack.

### 7.4 Phase refresh rules

`refreshEngagementPhase(...)` uses:

- weapon compatibility
- fuel/endurance reserve
- durability retreat threshold
- lock-loss range
- merge/overshoot detection
- orbit timeout
- deadlock detection

Key rules:

- if no compatible payload remains -> `disengaging`
- if endurance <= `14` or durability ratio <= `0.24` -> `disengaging`
- if target slips beyond sustainable envelope -> `disengaging`
- one-way platforms always prefer `attackRun`
- merge/overshoot -> pressing side goes `attackRun`, other side `repositioning`
- orbit timeout in pursuit -> break circular chase the same way
- deadlock -> break symmetric looping by forcing attack-vs-reposition asymmetry
- if a suitable weapon exists and distance <= `preferredRange * 1.08`, pursuit can become `attackRun`

### 7.5 Weapon selection

Usable weapons must satisfy:

- cooldown == 0
- enough ammunition for `getUsableAmmoCost(...)`
- weapon supports target type
- target distance is within `[minRange, maxRange]`

Weapon score:

```text
distancePenalty =
  1.0 if distance <= effectiveRange
  else clamp(1 - (distance - effectiveRange) / (maxRange - effectiveRange), 0.35, 1.0)
```

Target difficulty:

```text
effectiveEvasion =
  target.evasion * (0.45 + durabilityRatio * 0.55)
```

```text
TargetDifficulty =
  clamp(
    (1 - target.signature) * 0.28
    + effectiveEvasion * 0.34
    + interceptDifficulty * 0.24,
    0,
    0.72
  )
```

Weapon score:

```text
WeaponScore =
  damagePerHit
  * accuracy
  * probabilityOfKillBase
  * distancePenalty
  * (1 - targetDifficulty)
  * (1 + attacker.trackingQuality * 0.28)
```

The highest-scoring usable weapon is selected.

### 7.6 Hit chance

Against platforms:

```text
distanceModifier =
  1.0 if distance <= effectiveRange
  else clamp(1 - (distance - effectiveRange) / (maxRange - effectiveRange), 0.3, 1.0)
```

```text
trackingModifier =
  (0.72 + trackingQuality * 0.34)
  * (0.7 + attackerDurabilityRatio * 0.3)
```

```text
signatureModifier = 0.65 + target.signature * 0.42
```

```text
evasionModifier =
  1 - target.evasion * (0.42 + targetDurabilityRatio * 0.58) * 0.48
```

```text
interceptPenalty =
  1 - interceptDifficulty * 0.42   for ballistic missiles
  1.0                               otherwise
```

```text
HitChance =
  clamp(
    accuracy
    * probabilityOfKillBase
    * distanceModifier
    * trackingModifier
    * signatureModifier
    * evasionModifier
    * interceptPenalty,
    0.08,
    0.98
  )
```

Against objectives:

```text
ObjectiveHitChance =
  clamp(
    accuracy
    * probabilityOfKillBase
    * (0.82 + trackingQuality * 0.22),
    0.18,
    0.98
  )
```

### 7.7 Deterministic shot outcome

Combat outcomes are deterministic from hashed seeds, not random per run.

Hit roll:

```text
hitRoll = deterministicHash(tick, attackerId, targetId, weaponId, "hit")
miss if hitRoll > hitChance
```

Critical chance against platforms:

```text
criticalChance =
  clamp(0.08 + (0.08 if attackRun else 0) + (0.10 if targetDurabilityRatio <= 0.4 else 0),
        0.08,
        0.28)
```

Critical chance against objectives:

```text
0.24 for bombs
0.12 otherwise
```

### 7.8 Damage

Phase damage multiplier:

```text
1.35 for attackRun
0.82 for repositioning
0.74 for evading
1.00 otherwise
```

Class and finishing adjustments:

```text
* 1.08 if attacker is fighterJet
* 0.92 if attacker is drone
* 1.18 if target durability ratio <= 0.35
```

Platform shot damage:

```text
Damage =
  damagePerHit
  * salvoSize
  * phaseDamageMultiplier
  * (1.55 if critical else 1.0)
```

Objective shot damage:

```text
ObjectiveDamage =
  damagePerHit
  * salvoSize
  * (1.45 if critical else 1.0)
```

Armor / defense mitigation:

```text
PlatformMitigatedDamage = rawDamage * (1 - armor)
ObjectiveMitigatedDamage = rawDamage * (1 - defenseRating)
```

### 7.9 One-way impact logic

If a one-way platform reaches:

```text
distance <= impactRadius (or minimumStrikeDistance fallback)
```

then it performs terminal impact instead of reusable weapon fire:

```text
impactDamage = warheadDamage * 1.2
```

The attacker is destroyed immediately and the target takes a forced critical-style strike.

### 7.10 Firing window logic

Even if engaged, reusable platforms only resolve fire during a short attack-run window:

```text
combatPhase == attackRun
AND combatPhaseTimeSeconds <= 0.75
```

One-way platforms bypass that constraint and may continue resolving terminal impact while chasing.

### 7.11 Objective strikes

Enemy platforms not already engaged with allied platforms may strike cities when close enough.

Ballistic missiles directly impact if:

```text
distanceToCity <= impactRadius (or minimumStrikeDistance fallback)
```

Other platforms may use objective fire when:

```text
distanceToCity <= minimumStrikeDistance + 28
```

### 7.12 Code references

- `src/engine/combat.ts`
  - `refreshEngagementPhase(...)`
  - `selectWeapon(...)`
  - `computeHitChance(...)`
  - `resolveShotOutcome(...)`
  - `resolveObjectiveShotOutcome(...)`
  - `resolvePlatformFire(...)`
  - `resolveObjectiveFire(...)`
  - `resolveMissileImpact(...)`
  - `resolveCombat(...)`

---

## 8. File and function reference table

| Subsystem | File | Key functions | Purpose |
| --- | --- | --- | --- |
| Threat assessment | `src/engine/threat.ts` | `calculateCityThreat`, `calculateThreatsForCities` | Computes inverse-distance city threat from deployed enemies |
| Allied response | `src/engine/allocation.ts` | `getInterceptPriority`, `getReinforcementPriority`, `getWeaponEffectiveness`, `allocateResources` | Chooses intercept and reinforcement assignments |
| Team posture | `src/engine/posture.ts` | `evaluateAlliedForcePosture`, `evaluateEnemyForcePosture`, `applyPostureMemory` | Computes force demand, supply, surplus, and hysteresis |
| Enemy deployment | `src/engine/enemy-director.ts` | `getAggressionProfile`, `getCityExposureBreakdown`, `selectTargetCity`, `coordinateEnemyDeployments` | Controls launch pacing, target selection, and wave sizing |
| Combat | `src/engine/combat.ts` | `refreshEngagementPhase`, `computeHitChance`, `resolveShotOutcome`, `resolveCombat` | Controls engagement state, firing, damage, and destruction |

---

## 9. Notes and caveats

1. These formulas are mostly **heuristic scoring models**, not physically rigorous military models.
2. Multiple layers intentionally overlap:
   - city threat in `threat.ts`
   - city exposure in `enemy-director.ts`
   - city posture demand in `posture.ts`
3. The implementation is deterministic because hit/critical outcomes use a stable hash-based roll rather than per-run randomness.
4. Several constants are tuned for demo legibility and believable behavior rather than realism in a strict operational-analysis sense.
