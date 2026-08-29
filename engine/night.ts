import type { NightCfg } from './balance';
import type { RtState } from './rt';

export type NightLaneId = 'front' | 'vent' | 'service';
export type NightAction = 'repair' | 'decoy' | 'seal';

export const NIGHT_LANE_IDS: NightLaneId[] = ['front', 'vent', 'service'];

export type NightLane = {
  id: NightLaneId;
  barrier: number;
  maxBarrier: number;
  pressure: number;
  divertedUntilMs: number;
  sealedUntilMs: number;
  graceUntilMs: number;
  breaches: number;
};

export type NightDefenseState = {
  timeMs: number;
  durationMs: number;
  threat: number;
  wave: number;
  selectedLane: NightLaneId;
  lanes: NightLane[];
  materials: number;
  decoys: number;
  cells: number;
  coreHp: number;
  coreMaxHp: number;
  actionCooldownUntilMs: number;
  over: null | 'survived' | 'breached';
  log: { msg: string; atMs: number }[];
};

export type NightStart = {
  threat: number;
  carried: string[];
  decoys: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function deriveNightThreat(day: RtState, cfg: NightCfg): number {
  const lingerMs = Math.max(0, day.timeMs - cfg.lingerStartMs);
  return Math.round(clamp(
    cfg.baseThreat
      + day.stats.noisyEvents * cfg.noiseThreat
      + day.stats.spotted * cfg.spottedThreat
      + day.stats.woke * cfg.wokeThreat
      + (day.player.bitten ? cfg.bittenThreat : 0)
      + (lingerMs / 1000) * cfg.lingerThreatPerSecond,
    0,
    100,
  ));
}

export function newNightDefense(start: NightStart, cfg: NightCfg): NightDefenseState {
  const hasBattery = start.carried.includes('태블릿배터리');
  return {
    timeMs: 0,
    durationMs: cfg.durationMs,
    threat: clamp(start.threat, 0, 100),
    wave: 1,
    selectedLane: 'front',
    lanes: NIGHT_LANE_IDS.map((id) => ({
      id,
      barrier: cfg.maxBarrier,
      maxBarrier: cfg.maxBarrier,
      pressure: 0,
      divertedUntilMs: 0,
      sealedUntilMs: 0,
      graceUntilMs: 0,
      breaches: 0,
    })),
    materials: cfg.baseMaterials,
    decoys: Math.max(0, start.decoys),
    cells: hasBattery ? 2 : 0,
    coreHp: cfg.coreHp,
    coreMaxHp: cfg.coreHp,
    actionCooldownUntilMs: 0,
    over: null,
    log: [{ msg: '세 통로에서 발소리가 겹쳐 들린다.', atMs: 0 }],
  };
}

export function selectNightLane(state: NightDefenseState, laneId: NightLaneId): void {
  if (state.over) return;
  state.selectedLane = laneId;
}

export function applyNightAction(state: NightDefenseState, action: NightAction, cfg: NightCfg): boolean {
  if (state.over || state.timeMs < state.actionCooldownUntilMs) return false;
  const lane = state.lanes.find((candidate) => candidate.id === state.selectedLane);
  if (!lane) return false;

  if (action === 'repair') {
    if (state.materials <= 0 || lane.barrier >= lane.maxBarrier) return false;
    state.materials -= 1;
    lane.barrier = Math.min(lane.maxBarrier, lane.barrier + cfg.repairAmount);
    state.actionCooldownUntilMs = state.timeMs + cfg.repairCooldownMs;
    state.log.push({ msg: `${laneName(lane.id)} 바리케이드를 보강했다.`, atMs: state.timeMs });
    return true;
  }

  if (action === 'decoy') {
    if (state.decoys <= 0) return false;
    state.decoys -= 1;
    lane.divertedUntilMs = Math.max(lane.divertedUntilMs, state.timeMs + cfg.decoyMs);
    state.actionCooldownUntilMs = state.timeMs + cfg.repairCooldownMs;
    state.log.push({ msg: `${laneName(lane.id)} 밖으로 업무폰을 던졌다.`, atMs: state.timeMs });
    return true;
  }

  if (state.cells <= 0) return false;
  state.cells -= 1;
  lane.sealedUntilMs = Math.max(lane.sealedUntilMs, state.timeMs + cfg.sealMs);
  state.actionCooldownUntilMs = state.timeMs + cfg.repairCooldownMs;
  state.log.push({ msg: `${laneName(lane.id)} 방화 셔터에 전력을 공급했다.`, atMs: state.timeMs });
  return true;
}

export function stepNightDefense(state: NightDefenseState, deltaMs: number, cfg: NightCfg): void {
  if (state.over) return;
  const dt = clamp(deltaMs, 0, 100);
  state.timeMs = Math.min(state.durationMs, state.timeMs + dt);
  state.wave = Math.min(3, Math.floor(state.timeMs / cfg.waveMs) + 1);

  const laneBias = [1, 0.88, 0.95];
  const pulse = [0.78, 0.92, 1.18, 0.86, 1.05];
  const beat = Math.floor(state.timeMs / 2200);

  state.lanes.forEach((lane, index) => {
    const rawPressure = cfg.basePressure
      + state.threat * cfg.threatPressure
      + state.wave * cfg.wavePressure;
    let pressure = rawPressure * laneBias[index] * pulse[(beat + index * 2) % pulse.length];

    if (state.timeMs < lane.sealedUntilMs) pressure = 0;
    else if (state.timeMs < lane.divertedUntilMs) pressure *= 0.16;
    lane.pressure = Math.round(clamp(pressure, 0, 100));

    if (state.timeMs < lane.graceUntilMs) return;
    const activeMul = lane.id === state.selectedLane ? cfg.activeLaneDamageMul : 1;
    lane.barrier -= lane.pressure * cfg.pressureDamagePerSecond * activeMul * (dt / 1000);

    if (lane.barrier > 0) return;
    lane.breaches += 1;
    state.coreHp = Math.max(0, state.coreHp - 1);
    lane.barrier = cfg.breachResetBarrier;
    lane.graceUntilMs = state.timeMs + cfg.breachGraceMs;
    state.log.push({ msg: `${laneName(lane.id)} 방어선이 뚫렸다.`, atMs: state.timeMs });
  });

  if (state.coreHp <= 0) {
    state.over = 'breached';
    state.log.push({ msg: '마감 감염자들이 작업실 안으로 밀려들었다.', atMs: state.timeMs });
  } else if (state.timeMs >= state.durationMs) {
    state.over = 'survived';
    state.log.push({ msg: '동이 트자 감염자들의 움직임이 둔해졌다.', atMs: state.timeMs });
  }
}

export function laneName(laneId: NightLaneId): string {
  if (laneId === 'front') return '정문';
  if (laneId === 'vent') return '환풍구';
  return '지하 통로';
}
