export type TileKind = 'wall' | 'floor' | 'door' | 'glass' | 'shelf';

export type Facing = 'N' | 'E' | 'S' | 'W';

export type ZombieKind = 'walker' | 'listener' | 'shadow';

/** 무관심 → 의심 → 조사 → 추격 → 수색 */
export type ZState = 'IDLE' | 'SUSPICIOUS' | 'INVESTIGATE' | 'CHASE' | 'SEARCH';

export type ZombieDef = {
  kind: ZombieKind;
  start: number;
  facing: Facing;
  patrol: number[];
  /** 동면 — 소리를 듣기 전까지 움직이지도, 보지도, 신음하지도 않는다 */
  dormant?: boolean;
};

export type ItemDef = {
  name: string;
  tile: number;
  slot: 'large' | 'small';
};

export type MapDef = {
  w: number;
  h: number;
  kind: TileKind[];
  start: number;
  exit: number;
  waypoints: { name: string; tile: number }[];
  zombies: ZombieDef[];
  items: ItemDef[];
  meta: { turns: number; dusk: number; night: number };
};

export type Zombie = {
  id: number;
  kind: ZombieKind;
  tile: number;
  facing: Facing;
  patrol: number[];
  patrolIdx: number;
  patrolDir: 1 | -1;
  state: ZState;
  /** 조사/수색 목표 타일 */
  target: number | null;
  /** 현재 상태의 잔여 턴 */
  timer: number;
  /** 경직 잔여 턴. 뿌리치기에 당하면 1턴 못 움직인다 — 이게 '대응 턴 한 번'의 실체다. */
  stun: number;
  /** 다음 턴에 이동할 타일 — UI 예고용. 규칙 4조: 예고와 실제가 다르면 버그다. */
  nextTile: number | null;
};

export type Phase = 'day' | 'dusk' | 'night';

export type GameState = {
  turn: number;
  phase: Phase;
  rngState: number;

  hp: number;
  threat: number;
  bottles: number;
  carried: string[];

  playerTile: number;
  /** 질주 후 경직 — 다음 턴 이동 불가 */
  staggered: boolean;
  /** 붙잡힘 — 다음 행동은 뿌리치기로 고정 */
  grabbed: boolean;

  /** 열린 문 타일 목록 */
  openDoors: number[];
  /** 획득된 아이템 타일 */
  takenItems: number[];

  zombies: Zombie[];

  /** 0=미탐색 1=기억 2=현재시야 (타일별) */
  seen: number[];
  /** 좀비별 마지막 목격 정보 */
  ghosts: { id: number; tile: number; turn: number }[];
  /** 이번 턴 소음 필드 (렌더용). -1 = 도달 안 함 */
  noiseField: number[];
  /** 이번 턴 발생한 소음의 발생지와 크기 (렌더 전용) */
  lastNoise: { tile: number; value: number } | null;
  /** 플레이어에게 도달한 청각 단서. 정확한 칸은 알려주지 않는다 — 방향 + 거리대역만. */
  clues: { dir: string; band: '가까움' | '중간' | '멂'; turn: number }[];

  over: null | 'escaped' | 'dead' | 'timeout';
  log: string[];

  /** 입력 밀도 측정용 — 플레이어가 실제로 내린 명령 수 */
  commands: number;
  /** 이동/대기만 연속된 턴 수 추적 */
  idleRun: number;
  maxIdleRunTotal: number;
};

export type Command =
  | { t: 'step'; to: number }
  | { t: 'run'; to: number }
  | { t: 'vault'; to: number }
  | { t: 'door'; to: number }
  | { t: 'throw'; to: number }
  | { t: 'wait' }
  | { t: 'struggle' };

export type StopReason =
  | 'arrived'
  | 'new-zombie'
  | 'noise-clue'
  | 'new-room'
  | 'blocked'
  | 'game-over'
  | 'grabbed';
