/**
 * 실시간 격자 시뮬레이션.
 *
 * 턴을 버리고 시간 축으로 옮겼지만, 공간 규칙은 전부 geom.ts 를 그대로 쓴다 —
 * Bresenham 시야 · 소음 Dijkstra(닫힌 문 비용 3) · BFS 경로 · 시야 원뿔.
 *
 * 이 판의 설계 목표는 하나다: **소리를 안 내면 지나갈 수 있다.**
 * 그래서 세 가지가 붙어 있다.
 *   1) 인지 지연 — 시야에 들어가도 즉시 발각되지 않는다. 경계 게이지가 차야 한다.
 *   2) 좀비 신음 — 움직이는 좀비는 소리를 낸다. 벽 너머에서도 위치를 알 수 있다.
 *   3) 동면 — 자는 좀비는 움직이지도 보지도 신음하지도 않는다. 소리를 내면 깬다.
 */
import {
  blocksMove,
  chebyshev,
  facingFromDelta,
  hasLos,
  neighbors,
  noiseDistance,
  path,
  visibleFrom,
  xy,
  zombieSees,
} from './geom';
import { newCombat } from './combat';
import type { CombatState } from './combat';
import type { Facing, MapDef, ZState, ZombieKind } from './types';
import type { Balance } from './balance';

export const STEP_MS = 25;

export type Mover = {
  tile: number;
  from: number;
  /** 0..1 — from → tile 보간 */
  t: number;
  facing: Facing;
};

export type RtZombie = Mover & {
  id: number;
  kind: ZombieKind;
  patrol: number[];
  patrolIdx: number;
  patrolDir: 1 | -1;
  state: ZState;
  target: number | null;
  timerMs: number;
  stunMs: number;
  /** 동면 중이면 아무것도 하지 않는다 */
  dormant: boolean;
  /** 경계 게이지 0~100. 100 이 되면 추격. 이게 '인지 지연'의 실체다. */
  alert: number;
  lastGroanMs: number;
  /** 테스트나 연출에서 개별 좀비의 배회를 멈출 수 있다. */
  wanders: boolean;
};

export type Decoy = { id: number; tile: number; armAtMs: number; endAtMs: number };

/** src 로 플레이어 소음과 좀비 신음을 구분해 다르게 그린다 */
export type Noise = { tile: number; value: number; atMs: number; src: 'player' | 'zombie' };

export type RtState = {
  timeMs: number;
  player: Mover & {
    hp: number;
    bitten: boolean;
    hurtUntilMs: number;
    actUntilMs: number;
    actKind: null | 'break' | 'melee';
    hidden: boolean;
    holdingBreath: boolean;
    /** 현재 숨. 0이 되면 강제로 숨을 내쉬고 Space를 다시 눌러야 한다. */
    breath: number;
    breathLockedUntilMs: number;
    breathNeedsRelease: boolean;
    calmFeedback: null | 'success' | 'gasp';
    calmFeedbackUntilMs: number;
  };
  /** 무작위 배회도 같은 시드에서는 같은 결과가 나와야 한다. */
  rngState: number;
  zombies: RtZombie[];
  noises: Noise[];
  decoys: Decoy[];
  decoysLeft: number;
  openDoors: number[];
  brokenShelves: number[];
  takenItems: number[];
  carried: string[];
  seen: number[];
  ghosts: { id: number; tile: number; atMs: number }[];
  danger: number[];
  visibleIds: number[];
  visRev: number;
  /**
   * 마지막 인지 계산 시각.
   * 모듈 전역으로 두면 판을 여러 개 굴릴 때 서로 오염되고,
   * -999 로 시작하면 첫 프레임의 경과 시간이 1초로 잡혀 경계가 한 번에 차버린다.
   */
  lastPerceiveMs: number;
  /** 필드와 같은 상태 트리에 둬서 전투 중에는 시뮬레이션 시간을 완전히 멈춘다. */
  combat: CombatState | null;
  over: null | 'escaped' | 'dead';
  log: { msg: string; atMs: number }[];
  events: { type: string; atMs: number; detail?: string }[];
  stats: { steps: number; noisyEvents: number; spotted: number; decoysUsed: number; woke: number };
};

export type RtInput = {
  dir: Facing | null;
  /** 걷기는 기본, 달리기는 빠르지만 소음과 발각 위험이 크다. */
  gait: 'walk' | 'run';
  act: boolean;
  decoy: boolean;
  /** 진열대 옆에서 숨기 상태를 전환하는 1회 입력 */
  hide: boolean;
  /** 숨 참기 중 호흡을 한 번 진정시키는 1회 입력 */
  calm: boolean;
};

export type RtCfg = {
  gaitMs: Record<RtInput['gait'], number>;
  gaitNoise: Record<RtInput['gait'], number>;
  /** 달리기는 눈에도 잘 띈다. */
  gaitAlertMul: Record<RtInput['gait'], number>;
  /** 상태별 이동 속도(타일당 ms). 인지 전에는 느리게 어슬렁거린다. */
  zombieMs: { idle: number; investigate: number; chase: number };
  /** 상태별 신음 주기 */
  groanMs: { idle: number; investigate: number; chase: number };
  groanValue: number;
  sight: number;
  /** 최대 사거리에서 시야에 계속 들어가 있을 때 발각까지 걸리는 시간 */
  alertFullMs: number;
  /** 시야에서 벗어난 뒤 경계가 0으로 떨어지는 시간 */
  alertDecayMs: number;
  /** 은신 중 인접한 좀비의 경계가 0에서 100까지 차는 시간 */
  hiddenAlertFullMs: number;
  /** 숨을 참을 때 인접한 좀비의 경계가 100에서 0까지 내려가는 시간 */
  breathCalmMs: number;
  breathCapacity: number;
  /** Space를 계속 누를 때 기본 폐활량을 전부 쓰는 시간 */
  breathHoldMs: number;
  breathRecoverMs: number;
  breathSafeRecoverMs: number;
  breathLockMs: number;
  breathGaspNoise: number;
  breathGaspAlert: number;
  calmRestore: number;
  breakMs: number;
  meleeMs: number;
  decoyArmMs: number;
  decoyRunMs: number;
  decoyNoise: number;
};

export const DEFAULT_CFG: RtCfg = {
  gaitMs: { walk: 165, run: 105 },
  gaitNoise: { walk: 2, run: 5 },
  gaitAlertMul: { walk: 1, run: 1.7 },
  // 어슬렁거리는 좀비는 플레이어 걷기(165)의 4배 가까이 느리다.
  // 추격에 들어가면 빨라지지만 여전히 걷기보다 느려서 달아날 수 있다.
  zombieMs: { idle: 620, investigate: 430, chase: 250 },
  groanMs: { idle: 3400, investigate: 2000, chase: 1100 },
  groanValue: 3,
  sight: 6,
  alertFullMs: 1500,
  alertDecayMs: 2200,
  hiddenAlertFullMs: 5000,
  breathCalmMs: 2400,
  breathCapacity: 100,
  breathHoldMs: 5000,
  breathRecoverMs: 9000,
  breathSafeRecoverMs: 3200,
  breathLockMs: 1200,
  breathGaspNoise: 3,
  breathGaspAlert: 30,
  calmRestore: 14,
  breakMs: 1100,
  meleeMs: 420,
  decoyArmMs: 2200,
  decoyRunMs: 5500,
  decoyNoise: 6,
};

// ─────────────────────────────────────────────────────────────────────────────

export function newRt(m: MapDef, bal: Balance, cfg: RtCfg = DEFAULT_CFG, seed = 0x51f15e): RtState {
  const st: RtState = {
    timeMs: 0,
    rngState: seed >>> 0 || 1,
    player: {
      tile: m.start,
      from: m.start,
      t: 0,
      facing: 'S',
      hp: bal.player.hp,
      bitten: false,
      hurtUntilMs: -1,
      actUntilMs: -1,
      actKind: null,
      hidden: false,
      holdingBreath: false,
      breath: cfg.breathCapacity,
      breathLockedUntilMs: -1,
      breathNeedsRelease: false,
      calmFeedback: null,
      calmFeedbackUntilMs: -1,
    },
    zombies: m.zombies.map((d, i) => ({
      id: i,
      kind: d.kind,
      tile: d.start,
      from: d.start,
      t: 0,
      facing: d.facing,
      patrol: d.patrol.slice(),
      patrolIdx: Math.max(0, d.patrol.indexOf(d.start)),
      patrolDir: 1 as const,
      state: 'IDLE' as ZState,
      target: null,
      timerMs: 0,
      stunMs: 0,
      dormant: d.dormant ?? false,
      alert: 0,
      lastGroanMs: -9999 - i * 400, // 신음이 한꺼번에 터지지 않게 흩어놓는다
      wanders: true,
    })),
    noises: [],
    decoys: [],
    decoysLeft: 3,
    openDoors: [],
    brokenShelves: [],
    takenItems: [],
    carried: [],
    seen: new Array(m.w * m.h).fill(0),
    ghosts: [],
    danger: [],
    visibleIds: [],
    visRev: 0,
    lastPerceiveMs: 0,
    combat: null,
    over: null,
    log: [],
    events: [],
    stats: { steps: 0, noisyEvents: 0, spotted: 0, decoysUsed: 0, woke: 0 },
  };
  refresh(m, bal, st, cfg);
  return st;
}

function passable(m: MapDef, st: RtState) {
  return [...st.openDoors, ...st.brokenShelves];
}

/** 부서지지 않은 진열대 바로 옆에서만 몸을 숨길 수 있다. */
export function canHideAt(m: MapDef, st: RtState, tile = st.player.tile): boolean {
  return neighbors(m, tile).some((next) => m.kind[next] === 'shelf' && !st.brokenShelves.includes(next));
}

function resetBreathSession(player: RtState['player'], cfg: RtCfg) {
  player.holdingBreath = false;
  player.breath = cfg.breathCapacity;
  player.breathLockedUntilMs = -1;
  player.breathNeedsRelease = false;
  player.calmFeedback = null;
  player.calmFeedbackUntilMs = -1;
}

/** xorshift32 — 플레이마다 시드는 다르되, 같은 시드의 계약 테스트는 재현 가능하다. */
function random01(st: RtState): number {
  let x = st.rngState || 1;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  st.rngState = x >>> 0;
  return st.rngState / 0x100000000;
}

function dirTile(m: MapDef, tile: number, f: Facing): number {
  const p = xy(m, tile);
  const d = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }[f]!;
  const nx = p.x + d[0];
  const ny = p.y + d[1];
  if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) return -1;
  return ny * m.w + nx;
}

const OPPOSITE: Record<Facing, Facing> = { N: 'S', E: 'W', S: 'N', W: 'E' };

function canEnter(m: MapDef, st: RtState, tile: number, who: 'player' | 'zombie'): boolean {
  if (tile < 0) return false;
  const k = m.kind[tile]!;
  if (k === 'shelf' && !st.brokenShelves.includes(tile)) return false;
  return !blocksMove(m, tile, passable(m, st), who);
}

function retreatTileFor(m: MapDef, st: RtState, enemy: RtZombie, preferred: number): number {
  const candidates = [preferred, ...neighbors(m, st.player.tile)];
  return candidates.find((tile, index) => {
    if (tile < 0 || candidates.indexOf(tile) !== index || tile === enemy.tile) return false;
    if (!canEnter(m, st, tile, 'player')) return false;
    return !st.zombies.some((zombie) => zombie.id !== enemy.id && zombie.tile === tile);
  }) ?? st.player.tile;
}

function beginCombat(m: MapDef, bal: Balance, st: RtState, enemy: RtZombie, preferredRetreat: number, cfg: RtCfg) {
  if (st.combat || st.over) return;
  const P = st.player;
  const retreatTile = retreatTileFor(m, st, enemy, preferredRetreat);

  P.hidden = false;
  resetBreathSession(P, cfg);
  P.t = 0;
  P.from = P.tile;
  P.actKind = null;
  P.actUntilMs = -1;
  enemy.dormant = false;
  enemy.t = 0;
  enemy.from = enemy.tile;
  enemy.state = 'CHASE';
  enemy.target = P.tile;
  enemy.alert = 100;

  st.combat = newCombat({
    enemyId: enemy.id,
    enemyKind: enemy.kind,
    retreatTile,
    seed: st.rngState,
    playerHp: P.hp,
    playerBitten: P.bitten,
    cfg: bal.combat,
  });
  log(st, '추적자와 맞닥뜨렸다.');
  st.events.push({ type: 'combat-start', atMs: st.timeMs, detail: String(enemy.id) });
}

/** 전투 연출이 끝난 뒤 결과를 필드 상태에 한 번만 반영한다. */
export function finishCombat(m: MapDef, bal: Balance, st: RtState, cfg: RtCfg = DEFAULT_CFG) {
  const combat = st.combat;
  if (!combat?.outcome) return;

  const enemy = st.zombies.find((zombie) => zombie.id === combat.enemyId);
  st.player.hp = combat.playerHp;
  st.player.bitten = combat.playerBitten;

  if (combat.outcome === 'won') {
    st.zombies = st.zombies.filter((zombie) => zombie.id !== combat.enemyId);
    log(st, '추적자를 처리했다.');
    st.events.push({ type: 'combat-win', atMs: st.timeMs, detail: String(combat.enemyId) });
  } else if (combat.outcome === 'dead') {
    st.player.hp = 0;
    st.over = 'dead';
    log(st, '쓰러졌다.');
    st.events.push({ type: 'combat-dead', atMs: st.timeMs });
  } else if (enemy) {
    const encounterTile = enemy.tile;
    let retreat = combat.retreatTile;
    if (retreat === enemy.tile || !canEnter(m, st, retreat, 'player')) {
      retreat = retreatTileFor(m, st, enemy, retreat);
    }
    st.player.tile = retreat;
    st.player.from = retreat;
    st.player.t = 0;
    enemy.from = enemy.tile;
    enemy.t = 0;
    enemy.stunMs = bal.combat.fleeStunMs;
    enemy.state = 'SEARCH';
    enemy.target = encounterTile;
    enemy.timerMs = bal.combat.fleeStunMs;
    enemy.alert = Math.min(enemy.alert, 72);

    if (combat.usedRadio) {
      st.decoysLeft = Math.max(0, st.decoysLeft - 1);
      st.stats.decoysUsed++;
      emit(m, st, encounterTile, bal.combat.radioNoise, cfg, 'player');
      log(st, '업무폰 알림을 미끼로 빠져나왔다.');
    } else {
      emit(m, st, retreat, bal.combat.fleeNoise, cfg, 'player');
      log(st, '간신히 손아귀에서 벗어났다.');
    }
    st.events.push({ type: 'combat-fled', atMs: st.timeMs, detail: String(combat.enemyId) });
  }

  st.combat = null;
  refresh(m, bal, st, cfg);
}

const hearingOf = (z: RtZombie) => (z.kind === 'listener' ? 6 : z.kind === 'shadow' ? 5 : 3);

const sensesOf = (z: RtZombie, cfg: RtCfg) => ({
  sight: z.kind === 'listener' ? 1 : z.kind === 'shadow' ? cfg.sight + 1 : cfg.sight,
  nearSight: z.kind === 'listener' ? 1 : 2,
  coneCos: z.kind === 'shadow' ? 0.48 : 0.55,
});

const movementMsOf = (z: RtZombie, cfg: RtCfg) => {
  const base = z.state === 'CHASE'
    ? cfg.zombieMs.chase
    : z.state === 'IDLE'
      ? cfg.zombieMs.idle
      : cfg.zombieMs.investigate;
  return z.kind === 'shadow' ? Math.round(base * 0.84) : base;
};

/**
 * 소음 하나를 발생시킨다.
 *
 * 플레이어 소음은 좀비를 부르고, 좀비 신음은 플레이어에게 위치를 알려준다.
 * 같은 Dijkstra 를 양쪽으로 쓴다.
 */
function emit(
  m: MapDef,
  st: RtState,
  tile: number,
  value: number,
  cfg: RtCfg,
  src: 'player' | 'zombie',
) {
  const dist = noiseDistance(m, tile, passable(m, st), value + 4);

  if (src === 'player') {
    st.noises.push({ tile, value, atMs: st.timeMs, src });
    if (value >= 4) st.stats.noisyEvents++;

    for (const z of st.zombies) {
      const d = dist[z.tile]!;
      if (!Number.isFinite(d)) continue;
      if (d > value + (hearingOf(z) - 3)) continue;

      if (z.dormant) {
        z.dormant = false;
        z.patrol = [z.tile]; // 깬 자리에서 새로 순찰한다
        z.patrolIdx = 0;
        st.stats.woke++;
        log(st, '무언가 몸을 일으켰다.');
        st.events.push({ type: 'woke', atMs: st.timeMs });
      }
      if (z.state === 'CHASE') continue;
      z.state = 'INVESTIGATE';
      z.target = tile;
      z.timerMs = 2600;
    }
  } else {
    // 좀비 신음 — 플레이어에게 들릴 때만 화면에 남긴다.
    // 벽 너머여도 들리면 표시한다. 그게 이 단서의 존재 이유다.
    const toPlayer = dist[st.player.tile]!;
    if (Number.isFinite(toPlayer) && toPlayer <= value + 2) {
      st.noises.push({ tile, value, atMs: st.timeMs, src });
    }
  }

  if (st.noises.length > 28) st.noises.shift();
}

// ─────────────────────────────────────────────────────────────────────────────

export function stepRt(
  m: MapDef,
  bal: Balance,
  prev: RtState,
  input: RtInput,
  dtMs: number,
  cfg: RtCfg = DEFAULT_CFG,
): RtState {
  const st = prev;
  if (st.over || st.combat) return st;
  let acc = dtMs;
  let oneShot = input;
  while (acc > 0) {
    const dt = Math.min(STEP_MS, acc);
    acc -= dt;
    tick(m, bal, st, oneShot, dt, cfg);
    if (oneShot.hide || oneShot.decoy || oneShot.calm) {
      oneShot = { ...input, hide: false, decoy: false, calm: false };
    }
    if (st.over || st.combat) break;
  }
  return st;
}

function tick(m: MapDef, bal: Balance, st: RtState, input: RtInput, dt: number, cfg: RtCfg) {
  st.timeMs += dt;
  const P = st.player;

  if (input.hide && P.t === 0 && !P.actKind) {
    if (P.hidden) {
      P.hidden = false;
      resetBreathSession(P, cfg);
      log(st, '숨은 곳에서 나왔다.');
      st.events.push({ type: 'unhide', atMs: st.timeMs });
    } else if (canHideAt(m, st)) {
      const witness = st.zombies
        .filter((zombie) => (
          !zombie.dormant
          && zombie.stunMs <= 0
          && chebyshev(m, zombie.tile, P.tile) <= 1
          && (zombie.tile === P.tile || dirTile(m, zombie.tile, zombie.facing) === P.tile)
        ))
        .sort((a, b) => a.id - b.id)[0];

      if (witness) {
        const newlySpotted = witness.state !== 'CHASE';
        witness.alert = 100;
        witness.state = 'CHASE';
        witness.target = P.tile;
        witness.timerMs = 0;
        if (newlySpotted) st.stats.spotted++;
        st.events.push({ type: 'spotted', atMs: st.timeMs });
        log(st, '놈의 눈앞에서 숨으려다 들켰다.');
      } else {
        resetBreathSession(P, cfg);
        P.hidden = true;
        log(st, '원고 선반 뒤에 몸을 숨겼다.');
        st.events.push({ type: 'hide', atMs: st.timeMs });
      }
    } else {
      log(st, '몸을 숨길 만한 원고 선반이 없다.');
    }
  }

  if (P.hidden && input.dir) {
    P.hidden = false;
    resetBreathSession(P, cfg);
    log(st, '숨은 곳에서 움직였다.');
  }

  if (P.calmFeedback && st.timeMs >= P.calmFeedbackUntilMs) P.calmFeedback = null;

  const closeThreats = P.hidden
    ? st.zombies.filter((zombie) => (
      !zombie.dormant && zombie.stunMs <= 0 && chebyshev(m, zombie.tile, P.tile) <= 1
    ))
    : [];
  const hiddenThreat = closeThreats.length > 0;

  if (!input.act) P.breathNeedsRelease = false;
  const canHoldBreath = P.hidden
    && hiddenThreat
    && input.act
    && !P.breathNeedsRelease
    && st.timeMs >= P.breathLockedUntilMs
    && P.breath > 0;
  P.holdingBreath = canHoldBreath;

  if (P.holdingBreath) {
    P.breath = Math.max(0, P.breath - (cfg.breathCapacity / cfg.breathHoldMs) * dt);

    if (input.calm) {
      P.breath = Math.min(cfg.breathCapacity, P.breath + cfg.calmRestore);
      P.calmFeedback = 'success';
      P.calmFeedbackUntilMs = st.timeMs + 450;
      st.events.push({ type: 'breath-calm', atMs: st.timeMs });
    }

    if (P.breath <= 0) {
      P.breath = 0;
      P.holdingBreath = false;
      P.breathNeedsRelease = true;
      P.breathLockedUntilMs = st.timeMs + cfg.breathLockMs;
      P.calmFeedback = 'gasp';
      P.calmFeedbackUntilMs = P.breathLockedUntilMs;
      for (const zombie of closeThreats) {
        zombie.alert = Math.min(100, zombie.alert + cfg.breathGaspAlert);
      }
      emit(m, st, P.tile, cfg.breathGaspNoise, cfg, 'player');
      log(st, '참았던 숨이 한꺼번에 터졌다.');
      st.events.push({ type: 'breath-gasp', atMs: st.timeMs });
    }
  } else if (P.hidden && P.breath < cfg.breathCapacity) {
    const recoverMs = hiddenThreat ? cfg.breathRecoverMs : cfg.breathSafeRecoverMs;
    P.breath = Math.min(cfg.breathCapacity, P.breath + (cfg.breathCapacity / recoverMs) * dt);
  } else if (!P.hidden) {
    resetBreathSession(P, cfg);
  }

  if (P.actUntilMs > st.timeMs) {
    // 부수기/공격 진행 중 — 이동 불가
  } else if (P.actKind) {
    finishAct(m, bal, st, cfg);
  } else if (P.t > 0) {
    P.t += dt / cfg.gaitMs[input.gait];
    if (P.t >= 1) {
      P.t = 0;
      P.from = P.tile;
      arrive(m, bal, st, input, cfg);
    }
  } else if (input.dir) {
    const next = dirTile(m, P.tile, input.dir);
    P.facing = input.dir;
    if (canEnter(m, st, next, 'player')) {
      if (m.kind[next] === 'door' && !st.openDoors.includes(next)) {
        st.openDoors.push(next);
        emit(m, st, next, 1, cfg, 'player');
      }
      P.from = P.tile;
      P.tile = next;
      P.t = 0.001;
      st.stats.steps++;
    }
  }

  if (st.combat) return;

  if (input.act && !P.hidden && !P.actKind && P.t === 0) startAct(m, st, cfg);
  if (input.decoy && st.decoysLeft > 0 && !P.actKind && P.t === 0) {
    st.decoysLeft--;
    st.stats.decoysUsed++;
    st.decoys.push({
      id: st.decoys.length,
      tile: P.tile,
      armAtMs: st.timeMs + cfg.decoyArmMs,
      endAtMs: st.timeMs + cfg.decoyArmMs + cfg.decoyRunMs,
    });
    log(st, '업무폰을 켜두고 물러난다. 곧 알림이 쏟아진다.');
    st.events.push({ type: 'decoy', atMs: st.timeMs });
  }

  for (const d of st.decoys) {
    if (st.timeMs >= d.armAtMs && st.timeMs < d.endAtMs) {
      if (Math.floor(st.timeMs / 600) !== Math.floor((st.timeMs - dt) / 600)) {
        emit(m, st, d.tile, cfg.decoyNoise, cfg, 'player');
      }
    }
  }
  st.decoys = st.decoys.filter((d) => st.timeMs < d.endAtMs);

  for (const z of st.zombies) stepZombie(m, st, z, dt, cfg);

  if (st.timeMs - st.lastPerceiveMs >= 100) {
    const gap = Math.min(250, st.timeMs - st.lastPerceiveMs);
    st.lastPerceiveMs = st.timeMs;
    perceiveAll(m, st, gap, input, cfg);
    refresh(m, bal, st, cfg);
  }

  const touching = st.zombies
    .filter((z) => {
      if (P.hidden || z.stunMs > 0) return false;
      const sameTile = z.tile === P.tile;
      const crossedWhileMoving = P.t > 0
        && z.t > 0
        && P.from === z.tile
        && z.from === P.tile
        && P.t + z.t >= 1;
      return sameTile || crossedWhileMoving;
    })
    .sort((a, b) => a.id - b.id)[0];
  if (touching) {
    const retreat = P.t > 0 ? P.from : dirTile(m, P.tile, OPPOSITE[P.facing]);
    beginCombat(m, bal, st, touching, retreat, cfg);
  }

  st.noises = st.noises.filter((n) => st.timeMs - n.atMs < 1600);
}

function arrive(m: MapDef, bal: Balance, st: RtState, input: RtInput, cfg: RtCfg) {
  const P = st.player;
  const k = m.kind[P.tile]!;
  const base = cfg.gaitNoise[input.gait];
  const value = k === 'glass' ? Math.max(base, 5) : base;
  if (value > 0) emit(m, st, P.tile, value, cfg, 'player');
  if (k === 'glass') log(st, '유리를 밟았다!');

  for (const it of m.items) {
    if (it.tile === P.tile && !st.takenItems.includes(it.tile)) {
      st.takenItems.push(it.tile);
      st.carried.push(it.name);
      const itemName = it.name === '최종원고' ? '최종 원고' : it.name === '태블릿배터리' ? '태블릿 배터리' : it.name;
      log(st, `${itemName} 획득.`);
      st.events.push({ type: 'loot', atMs: st.timeMs, detail: it.name });
    }
  }
  if (P.tile === m.exit) {
    if (st.carried.includes('최종원고')) {
      st.over = 'escaped';
      log(st, '최종 원고를 업로드했다. 마감 컷이 닫힌다.');
    } else if (!st.log.length || st.log[st.log.length - 1]?.msg !== '업로드할 최종 원고가 없다.') {
      log(st, '업로드할 최종 원고가 없다.');
    }
  }
}

function startAct(m: MapDef, st: RtState, cfg: RtCfg) {
  const P = st.player;
  const front = dirTile(m, P.tile, P.facing);
  if (front < 0) return;
  if (st.zombies.some((x) => x.tile === front)) {
    P.actKind = 'melee';
    P.actUntilMs = st.timeMs + cfg.meleeMs;
  } else if (m.kind[front] === 'shelf' && !st.brokenShelves.includes(front)) {
    P.actKind = 'break';
    P.actUntilMs = st.timeMs + cfg.breakMs;
  }
}

function finishAct(m: MapDef, bal: Balance, st: RtState, cfg: RtCfg) {
  const P = st.player;
  const front = dirTile(m, P.tile, P.facing);
  if (P.actKind === 'melee') {
    const z = st.zombies.find((x) => x.tile === front);
    if (z) {
      // 자고 있거나 등을 보이면 처리된다. 정면으로 깨어 있으면 1:1 교전에 들어간다.
      if (z.dormant || dirTile(m, z.tile, z.facing) !== P.tile) {
        st.zombies = st.zombies.filter((x) => x.id !== z.id);
        log(st, z.dormant ? '자는 사이에 처리했다.' : '뒤에서 처리했다.');
        st.events.push({ type: 'takedown', atMs: st.timeMs });
      } else {
        beginCombat(m, bal, st, z, P.tile, cfg);
      }
    }
    emit(m, st, P.tile, 3, cfg, 'player');
  } else if (P.actKind === 'break') {
    if (m.kind[front] === 'shelf' && !st.brokenShelves.includes(front)) {
      st.brokenShelves.push(front);
      log(st, '원고 선반을 무너뜨렸다. 길이 뚫렸다.');
      emit(m, st, front, 6, cfg, 'player');
      st.events.push({ type: 'break', atMs: st.timeMs });
    }
  }
  P.actKind = null;
  P.actUntilMs = -1;
}

// ─────────────────────────────────────────────────────────────────────────────

function stepZombie(m: MapDef, st: RtState, z: RtZombie, dt: number, cfg: RtCfg) {
  if (z.dormant) return; // 자는 좀비는 움직이지도 신음하지도 않는다
  if (z.stunMs > 0) {
    z.stunMs -= dt;
    return;
  }

  // 신음 — 확률이 아니라 주기다. 플레이어가 리듬을 셀 수 있어야 한다.
  const gmBase =
    z.state === 'CHASE' ? cfg.groanMs.chase : z.state === 'IDLE' ? cfg.groanMs.idle : cfg.groanMs.investigate;
  const gm = z.kind === 'shadow' ? Math.round(gmBase * 1.45) : gmBase;
  if (st.timeMs - z.lastGroanMs >= gm) {
    z.lastGroanMs = st.timeMs;
    emit(m, st, z.tile, cfg.groanValue, cfg, 'zombie');
  }

  // 마지막으로 본 위치까지는 경계 게이지가 낮아져도 반드시 확인한다.
  // 숨은 플레이어와 같은 칸은 통로가 아니라 진열대 쪽으로 몸을 뺀 상태이므로
  // 좀비가 들어와 수색하거나 그대로 지나갈 수 있다.
  if (z.t === 0 && z.target != null && z.tile === z.target) {
    if (z.state === 'SUSPICIOUS') {
      z.state = 'SEARCH';
      z.timerMs = Math.max(z.timerMs, 1600);
    } else if (z.state === 'CHASE' && st.player.hidden) {
      z.state = 'SEARCH';
      z.timerMs = Math.max(z.timerMs, 3200);
      z.alert = Math.min(z.alert, 72);
    }
  }

  if (z.timerMs > 0 && z.t === 0 && (z.state === 'INVESTIGATE' || z.state === 'SEARCH')) {
    if (z.target != null && z.tile === z.target) {
      z.timerMs -= dt;
      if (z.timerMs <= 0) {
        z.state = 'IDLE';
        z.target = null;
        if (z.kind === 'listener') {
          z.patrol = [z.tile];
          z.patrolIdx = 0;
        }
      }
      return;
    }
  }

  const ms = movementMsOf(z, cfg);

  if (z.t > 0) {
    z.t += dt / ms;
    if (z.t >= 1) {
      z.t = 0;
      z.from = z.tile;
    }
    return;
  }

  const next = nextTileFor(m, st, z);
  if (next == null || next === z.tile) return;
  if (st.zombies.some((o) => o.id !== z.id && o.tile === next)) return;

  const a = xy(m, z.tile);
  const b = xy(m, next);
  z.facing = facingFromDelta(b.x - a.x, b.y - a.y);
  z.from = z.tile;
  z.tile = next;
  z.t = 0.001;
}

function nextTileFor(m: MapDef, st: RtState, z: RtZombie): number | null {
  const open = passable(m, st);
  if (z.state === 'CHASE') {
    const p = path(m, z.tile, st.player.tile, open, 'zombie');
    return p && p.length ? p[0]! : null;
  }
  if ((z.state === 'SUSPICIOUS' || z.state === 'INVESTIGATE' || z.state === 'SEARCH') && z.target != null) {
    const p = path(m, z.tile, z.target, open, 'zombie');
    return p && p.length ? p[0]! : null;
  }
  if (!z.wanders) return null;

  // 무관심 상태에서는 지정 순찰선을 왕복하지 않고, 교차로마다 방향을 새로 고른다.
  // 직전 칸으로 바로 되돌아가는 것은 막다른 길에서만 허용해 덜 부산스럽게 보이게 한다.
  let choices = neighbors(m, z.tile).filter((tile) => {
    if (!st.player.hidden && tile === st.player.tile) return false;
    if (blocksMove(m, tile, open, 'zombie')) return false;
    return !st.zombies.some((other) => other.id !== z.id && other.tile === tile);
  });
  const forward = choices.filter((tile) => tile !== z.from);
  if (forward.length) choices = forward;
  if (!choices.length) return null;
  return choices[Math.floor(random01(st) * choices.length)] ?? null;
}

/**
 * 인지 — 즉시 발각이 아니라 경계 게이지를 채운다.
 *
 * 가까울수록, 뛸수록 빨리 찬다.
 * 시야에서 벗어나면 내려간다. 이 게이지가 "물러날 창"을 만든다.
 */
function perceiveAll(m: MapDef, st: RtState, dt: number, input: RtInput, cfg: RtCfg) {
  const open = passable(m, st);
  for (const z of st.zombies) {
    if (z.dormant || z.stunMs > 0) continue;

    const cone = sensesOf(z, cfg);
    const distance = chebyshev(m, z.tile, st.player.tile);

    // 숨은 플레이어 바로 옆에서는 인기척 때문에 경계가 천천히 오른다.
    // Space로 숨을 참으면 같은 게이지가 내려가므로 별도의 확률 판정은 없다.
    if (st.player.hidden && distance <= 1) {
      const rate = st.player.holdingBreath
        ? -(100 / cfg.breathCalmMs)
        : 100 / cfg.hiddenAlertFullMs;
      z.alert = Math.max(0, Math.min(100, z.alert + rate * dt));

      if (z.alert >= 100) {
        st.player.hidden = false;
        resetBreathSession(st.player, cfg);
        z.state = 'CHASE';
        z.target = st.player.tile;
        z.timerMs = 0;
        st.stats.spotted++;
        st.events.push({ type: 'spotted', atMs: st.timeMs });
        log(st, '숨소리를 들켰다.');
      } else if (z.alert > 25 && z.state === 'IDLE') {
        z.state = 'SUSPICIOUS';
        z.target = st.player.tile;
      } else if (z.alert <= 1 && z.state === 'SUSPICIOUS') {
        z.state = 'IDLE';
        z.target = null;
      }
      continue;
    }

    // 진열대 뒤에 몸을 숨긴 동안에는 일반 시야 판정에서 제외한다.
    // 이미 추적 중이던 좀비는 마지막 위치 바로 앞에서 수색하지만 플레이어 칸에 들어오지는 않는다.
    const inSight = !st.player.hidden && zombieSees(m, z.tile, z.facing, st.player.tile, open, cone);

    if (inSight) {
      // 최대 사거리에서 1배, 코앞에서 3배
      const prox = 1 + 2 * (1 - Math.min(1, distance / cone.sight));
      const rate = (100 / cfg.alertFullMs) * prox * cfg.gaitAlertMul[input.gait];
      z.alert = Math.min(100, z.alert + rate * dt);
      if (z.alert >= 100 && z.state !== 'CHASE') {
        z.state = 'CHASE';
        z.target = st.player.tile;
        z.timerMs = 0;
        st.stats.spotted++;
        st.events.push({ type: 'spotted', atMs: st.timeMs });
        log(st, '발각됐다.');
      } else if (z.state === 'IDLE' && z.alert > 25) {
        z.state = 'SUSPICIOUS';
        z.target = st.player.tile;
      }
      if (z.state === 'SUSPICIOUS') z.target = st.player.tile;
    } else {
      const checkingLastSeen = z.state === 'SUSPICIOUS' && z.target != null && z.tile !== z.target;
      if (checkingLastSeen) z.alert = Math.max(26, z.alert);
      else z.alert = Math.max(0, z.alert - (100 / cfg.alertDecayMs) * dt);
      if (!checkingLastSeen && z.state === 'SUSPICIOUS' && z.alert <= 1) {
        z.state = 'IDLE';
        z.target = null;
      }
      if (z.state === 'CHASE' && z.alert <= 0) {
        z.state = 'SEARCH';
        z.target = st.player.tile;
        z.timerMs = 3200;
      }
    }

    if (z.state === 'CHASE' && inSight) z.target = st.player.tile;
  }
}

function refresh(m: MapDef, bal: Balance, st: RtState, cfg: RtCfg) {
  const open = passable(m, st);
  for (let i = 0; i < st.seen.length; i++) if (st.seen[i] === 2) st.seen[i] = 1;

  const visList = visibleFrom(m, st.player.tile, bal.player.sight + 2, open);
  for (const t of visList) st.seen[t] = 2;
  const vis = new Set(visList);
  st.visibleIds = st.zombies.filter((z) => vis.has(z.tile)).map((z) => z.id);

  const danger = new Set<number>();
  for (const z of st.zombies) {
    if (z.dormant) continue; // 자는 좀비는 위험 칸을 만들지 않는다
    if (!vis.has(z.tile)) continue;
    const c = sensesOf(z, cfg);
    for (let t = 0; t < m.w * m.h; t++) {
      if (m.kind[t] === 'wall') continue;
      if (chebyshev(m, z.tile, t) > c.sight) continue;
      if (zombieSees(m, z.tile, z.facing, t, open, c)) danger.add(t);
    }
    const g = st.ghosts.find((x) => x.id === z.id);
    if (g) {
      g.tile = z.tile;
      g.atMs = st.timeMs;
    } else st.ghosts.push({ id: z.id, tile: z.tile, atMs: st.timeMs });
  }
  st.danger = [...danger];
  st.visRev++;
}

function log(st: RtState, msg: string) {
  st.log.push({ msg, atMs: st.timeMs });
  if (st.log.length > 40) st.log.shift();
}

/** 렌더 전용 — refresh() 가 만들어둔 캐시를 읽는다 */
export function visibleZombies(st: RtState): Set<number> {
  return new Set(st.visibleIds);
}

/** 보간된 화면 좌표(타일 단위 실수) */
export function lerpPos(m: MapDef, mv: Mover): { x: number; y: number } {
  const a = xy(m, mv.from);
  const b = xy(m, mv.tile);
  const t = mv.t === 0 ? 1 : mv.t;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
