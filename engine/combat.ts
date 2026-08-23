import type { CombatCfg } from './balance';
import type { ZombieKind } from './types';

export type CombatPart = 'head' | 'arms' | 'legs' | 'torso';
export type EnemyIntent = 'grab' | 'bite' | 'lunge';
export type CombatOutcome = null | 'won' | 'fled' | 'dead';
export type CombatMotion = 'enter' | 'strike' | 'shove' | 'radio' | 'flee' | 'recoil' | 'guard' | 'parry';
export type DefenseResult = 'parry' | 'guard' | 'miss';

export type CombatAction =
  | { type: 'attack'; target: CombatPart }
  | { type: 'shove' }
  | { type: 'radio' }
  | { type: 'flee' };

export type CombatEvent = {
  side: 'player' | 'enemy' | 'system';
  tone: 'plain' | 'good' | 'bad';
  text: string;
};

export type CombatState = {
  enemyId: number;
  enemyKind: ZombieKind;
  retreatTile: number;
  seed: number;
  round: number;
  playerHp: number;
  playerBitten: boolean;
  enemyMaxHp: number;
  enemyHp: number;
  armsBroken: boolean;
  legsBroken: boolean;
  restrained: boolean;
  distance: 'close' | 'open';
  intent: EnemyIntent;
  outcome: CombatOutcome;
  usedRadio: boolean;
  lastMotion: CombatMotion;
  lastTarget: CombatPart | null;
  enemyResponded: boolean;
  awaitingDefense: boolean;
  lastDefense: DefenseResult | null;
  actionSerial: number;
  events: CombatEvent[];
};

const INTENTS: EnemyIntent[] = ['grab', 'bite', 'lunge'];

export const PART_LABELS: Record<CombatPart, string> = {
  head: '머리',
  arms: '팔',
  legs: '다리',
  torso: '몸통',
};

export const INTENT_COPY: Record<EnemyIntent, { label: string; detail: string }> = {
  grab: { label: '붙잡기', detail: '팔이 멀쩡하면 다음 행동을 봉쇄한다.' },
  bite: { label: '물어뜯기', detail: '가까이 붙으면 체력과 안전을 함께 잃는다.' },
  lunge: { label: '돌진', detail: '거리를 무시한다. 다리를 망가뜨리면 막을 수 있다.' },
};

function intentFor(enemyId: number, round: number, seed: number): EnemyIntent {
  const offset = (enemyId + (seed % INTENTS.length)) % INTENTS.length;
  return INTENTS[(offset + round - 1) % INTENTS.length]!;
}

export function newCombat(args: {
  enemyId: number;
  enemyKind: ZombieKind;
  retreatTile: number;
  seed: number;
  playerHp: number;
  playerBitten: boolean;
  cfg: CombatCfg;
}): CombatState {
  const seed = args.seed >>> 0;
  return {
    enemyId: args.enemyId,
    enemyKind: args.enemyKind,
    retreatTile: args.retreatTile,
    seed,
    round: 1,
    playerHp: args.playerHp,
    playerBitten: args.playerBitten,
    enemyMaxHp: args.cfg.enemyHp,
    enemyHp: args.cfg.enemyHp,
    armsBroken: false,
    legsBroken: false,
    restrained: false,
    distance: 'close',
    intent: intentFor(args.enemyId, 1, seed),
    outcome: null,
    usedRadio: false,
    lastMotion: 'enter',
    lastTarget: null,
    enemyResponded: false,
    awaitingDefense: false,
    lastDefense: null,
    actionSerial: 0,
    events: [{ side: 'system', tone: 'bad', text: '퇴로가 막혔다. 먼저 망가뜨릴 곳을 골라야 한다.' }],
  };
}

function advanceRound(combat: CombatState) {
  combat.round += 1;
  combat.intent = intentFor(combat.enemyId, combat.round, combat.seed);
}

function enemyTurn(combat: CombatState, cfg: CombatCfg) {
  combat.awaitingDefense = false;
  combat.enemyResponded = true;

  if (combat.distance === 'open' && combat.intent !== 'lunge') {
    combat.events.push({ side: 'enemy', tone: 'good', text: '상대가 거리를 좁히는 데 한 박자 늦었다.' });
    combat.distance = 'close';
    advanceRound(combat);
    return;
  }

  if (combat.intent === 'grab') {
    if (combat.armsBroken) {
      combat.events.push({ side: 'enemy', tone: 'good', text: '망가진 팔이 허공을 긁었다.' });
    } else {
      combat.restrained = true;
      combat.events.push({ side: 'enemy', tone: 'bad', text: '옷깃을 붙잡혔다. 공격과 도주가 막혔다.' });
    }
  } else if (combat.intent === 'bite') {
    combat.playerHp = Math.max(0, combat.playerHp - cfg.biteDamage);
    combat.playerBitten = true;
    combat.events.push({ side: 'enemy', tone: 'bad', text: `살을 내줬다. 체력 ${combat.playerHp}.` });
  } else if (combat.legsBroken) {
    combat.events.push({ side: 'enemy', tone: 'good', text: '꺾인 다리가 버티지 못하고 주저앉았다.' });
  } else {
    combat.playerHp = Math.max(0, combat.playerHp - cfg.lungeDamage);
    combat.events.push({ side: 'enemy', tone: 'bad', text: `몸통으로 들이받혔다. 체력 ${combat.playerHp}.` });
  }

  combat.distance = 'close';
  if (combat.playerHp <= 0) {
    combat.outcome = 'dead';
    combat.events.push({ side: 'system', tone: 'bad', text: '손전등이 바닥을 구르며 멈췄다.' });
    return;
  }
  advanceRound(combat);
}

function enemyAttackCanLand(combat: CombatState) {
  if (combat.distance === 'open' && combat.intent !== 'lunge') return false;
  if (combat.intent === 'grab' && combat.armsBroken) return false;
  if (combat.intent === 'lunge' && combat.legsBroken) return false;
  return true;
}

function beginEnemyTurn(combat: CombatState, cfg: CombatCfg) {
  if (!enemyAttackCanLand(combat)) {
    enemyTurn(combat, cfg);
    return;
  }

  combat.awaitingDefense = true;
  combat.enemyResponded = false;
  combat.events.push({ side: 'system', tone: 'bad', text: '공격이 온다. 박자를 읽고 막아내야 한다.' });
}

function strike(combat: CombatState, target: CombatPart, cfg: CombatCfg) {
  combat.lastTarget = target;
  combat.lastMotion = 'strike';
  const damage = target === 'head'
    ? cfg.headDamage
    : target === 'torso'
      ? cfg.torsoDamage
      : cfg.limbDamage;
  combat.enemyHp = Math.max(0, combat.enemyHp - damage);
  const hp = `HP ${combat.enemyHp}/${combat.enemyMaxHp}`;

  if (target === 'head') {
    combat.events.push({ side: 'player', tone: 'plain', text: `관자놀이를 후려쳤다. ${damage} 피해 · ${hp}.` });
  } else if (target === 'torso') {
    combat.events.push({ side: 'player', tone: 'plain', text: `가슴팍을 밀어 찧었다. ${damage} 피해 · ${hp}.` });
  } else if (target === 'arms') {
    if (combat.armsBroken) {
      combat.events.push({ side: 'player', tone: 'plain', text: `이미 늘어진 팔을 다시 걷어냈다. ${damage} 피해 · ${hp}.` });
    } else {
      combat.armsBroken = true;
      combat.restrained = false;
      combat.events.push({ side: 'player', tone: 'good', text: `팔꿈치를 꺾었다. ${damage} 피해 · 이제 붙잡기는 통하지 않는다. ${hp}.` });
    }
  } else if (combat.legsBroken) {
    combat.events.push({ side: 'player', tone: 'plain', text: `망가진 무릎을 다시 걷어찼다. ${damage} 피해 · ${hp}.` });
  } else {
    combat.legsBroken = true;
    combat.events.push({ side: 'player', tone: 'good', text: `무릎이 반대로 접혔다. ${damage} 피해 · 도주할 틈이 생겼다. ${hp}.` });
  }

  if (combat.enemyHp <= 0) {
    combat.outcome = 'won';
    combat.events.push({ side: 'system', tone: 'good', text: '상대가 원고를 놓치고 쓰러졌다.' });
    return;
  }
  beginEnemyTurn(combat, cfg);
}

export function canFlee(combat: CombatState) {
  return !combat.restrained && (combat.distance === 'open' || combat.legsBroken);
}

export function resolveCombatAction(current: CombatState, action: CombatAction, cfg: CombatCfg): CombatState {
  if (current.outcome || current.awaitingDefense) return current;

  const combat: CombatState = {
    ...current,
    events: [],
    actionSerial: current.actionSerial + 1,
    lastTarget: null,
    enemyResponded: false,
    lastDefense: null,
  };

  if (action.type === 'attack') {
    if (combat.restrained) {
      combat.lastMotion = 'recoil';
      combat.events.push({ side: 'system', tone: 'bad', text: '붙잡힌 채로는 제대로 휘두를 수 없다. 먼저 밀쳐내야 한다.' });
      return combat;
    }
    strike(combat, action.target, cfg);
    return combat;
  }

  if (action.type === 'shove') {
    combat.lastMotion = 'shove';
    combat.restrained = false;
    combat.distance = 'open';
    combat.events.push({ side: 'player', tone: 'good', text: '어깨로 밀어내 한 걸음의 틈을 만들었다.' });
    advanceRound(combat);
    return combat;
  }

  if (action.type === 'radio') {
    combat.lastMotion = 'radio';
    combat.usedRadio = true;
    combat.outcome = 'fled';
    combat.events.push({ side: 'player', tone: 'good', text: '업무폰을 반대편으로 던졌다. 쏟아지는 알림에 고개가 돌아간다.' });
    return combat;
  }

  combat.lastMotion = 'flee';
  if (canFlee(combat)) {
    combat.outcome = 'fled';
    combat.events.push({ side: 'player', tone: 'good', text: '빈틈을 파고들어 통로 반대편으로 빠져나왔다.' });
    return combat;
  }

  combat.events.push({ side: 'player', tone: 'bad', text: '등을 돌렸지만 손이 닿았다. 아직 도망칠 틈이 없다.' });
  beginEnemyTurn(combat, cfg);
  return combat;
}

export function resolveCombatDefense(current: CombatState, result: DefenseResult, cfg: CombatCfg): CombatState {
  if (current.outcome || !current.awaitingDefense) return current;

  const combat: CombatState = {
    ...current,
    events: [],
    actionSerial: current.actionSerial + 1,
    awaitingDefense: false,
    lastDefense: result,
    enemyResponded: true,
  };

  if (result === 'miss') {
    combat.lastMotion = 'recoil';
    enemyTurn(combat, cfg);
    return combat;
  }

  if (result === 'parry') {
    combat.lastMotion = 'parry';
    combat.restrained = false;
    combat.distance = 'open';
    combat.enemyHp = Math.max(0, combat.enemyHp - cfg.parryDamage);
    combat.events.push({ side: 'player', tone: 'good', text: `정확히 흘려냈다. 반격 ${cfg.parryDamage} 피해 · HP ${combat.enemyHp}/${combat.enemyMaxHp}.` });

    if (combat.enemyHp <= 0) {
      combat.outcome = 'won';
      combat.events.push({ side: 'system', tone: 'good', text: '공격하던 힘을 되돌려 상대를 쓰러뜨렸다.' });
      return combat;
    }

    advanceRound(combat);
    return combat;
  }

  combat.lastMotion = 'guard';
  combat.restrained = false;
  combat.distance = 'close';

  if (combat.intent === 'grab') {
    combat.events.push({ side: 'player', tone: 'good', text: '팔을 걷어내 붙잡기를 막았다.' });
  } else {
    const incoming = combat.intent === 'bite' ? cfg.biteDamage : cfg.lungeDamage;
    const damage = Math.max(0, incoming - cfg.guardDamageReduction);
    combat.playerHp = Math.max(0, combat.playerHp - damage);
    if (combat.intent === 'bite' && damage > 0) combat.playerBitten = true;
    combat.events.push({
      side: 'player',
      tone: damage > 0 ? 'plain' : 'good',
      text: damage > 0 ? `충격을 줄였다. 체력 ${combat.playerHp}.` : '공격을 받아내 피해를 막았다.',
    });
  }

  if (combat.playerHp <= 0) {
    combat.outcome = 'dead';
    combat.events.push({ side: 'system', tone: 'bad', text: '막아냈지만 더는 버틸 힘이 남지 않았다.' });
    return combat;
  }

  advanceRound(combat);
  return combat;
}
