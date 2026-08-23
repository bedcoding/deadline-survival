import type { MapDef } from './types';

/**
 * 격자 위의 순수 기하 계산.
 *
 * 이 파일이 "내부는 격자" 절반을 담당한다.
 * 웨이포인트는 여기 존재하지 않는다 — 입력 계층의 개념이기 때문이다.
 */

export const xy = (m: MapDef, t: number) => ({ x: t % m.w, y: Math.floor(t / m.w) });
export const idx = (m: MapDef, x: number, y: number) => y * m.w + x;

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], // N
  [1, 0], // E
  [0, 1], // S
  [-1, 0], // W
];

export const FACING_VEC: Record<string, readonly [number, number]> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
};

export function facingFromDelta(dx: number, dy: number): 'N' | 'E' | 'S' | 'W' {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'E' : 'W';
  return dy >= 0 ? 'S' : 'N';
}

/**
 * 시야를 막는가 — 벽 · 닫힌 문 · 진열대.
 *
 * 진열대가 시야를 막아야 마트의 '통로'가 생긴다.
 * 통로를 따라서는 멀리 보이지만 옆 통로는 안 보인다 — 이 비대칭이 잠입의 지형이다.
 * 대신 플레이어는 진열대를 넘을 수 있고(느리고 시끄럽다) 좀비는 못 넘는다.
 */
export function blocksSight(m: MapDef, t: number, openDoors: readonly number[]): boolean {
  const k = m.kind[t]!;
  if (k === 'wall') return true;
  if (k === 'shelf') return true;
  if (k === 'door') return !openDoors.includes(t);
  return false;
}

/** 이동을 막는가. 진열대는 좀비만 막는다(플레이어는 vault). */
export function blocksMove(
  m: MapDef,
  t: number,
  openDoors: readonly number[],
  who: 'player' | 'zombie',
): boolean {
  const k = m.kind[t]!;
  if (k === 'wall') return true;
  if (k === 'shelf') return who === 'zombie';
  if (k === 'door') return who === 'player' ? false : !openDoors.includes(t);
  return false;
}

export function neighbors(m: MapDef, t: number): number[] {
  const { x, y } = xy(m, t);
  const out: number[] = [];
  for (const [dx, dy] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
    out.push(idx(m, nx, ny));
  }
  return out;
}

/**
 * 최단 경로 BFS. 동률이면 항상 N→E→S→W 순으로 확정한다(결정론 헌법).
 * 반환: from 에서 to 까지의 타일 배열(from 제외, to 포함). 도달 불가면 null.
 */
export function path(
  m: MapDef,
  from: number,
  to: number,
  openDoors: readonly number[],
  who: 'player' | 'zombie',
): number[] | null {
  if (from === to) return [];
  const prev = new Map<number, number>();
  const seen = new Set<number>([from]);
  let frontier = [from];

  while (frontier.length) {
    const next: number[] = [];
    for (const cur of frontier) {
      for (const nb of neighbors(m, cur)) {
        if (seen.has(nb)) continue;
        if (nb !== to && blocksMove(m, nb, openDoors, who)) continue;
        if (nb === to && blocksMove(m, nb, openDoors, who) && m.kind[nb] === 'wall') continue;
        seen.add(nb);
        prev.set(nb, cur);
        if (nb === to) {
          const out: number[] = [];
          let c = to;
          while (c !== from) {
            out.push(c);
            c = prev.get(c)!;
          }
          return out.reverse();
        }
        next.push(nb);
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * 소음 전파 — 간선 비용 1, 닫힌 문 3.
 * 반환: 타일별 소음 도달 거리. 도달 못 하면 Infinity.
 *
 * ★ 이 함수 하나를 양방향으로 재사용한다.
 *   플레이어 → 좀비 : 좀비가 반응할지 판정
 *   좀비 → 플레이어 : 플레이어가 어느 등급으로 단서를 받을지 결정
 */
export function noiseDistance(
  m: MapDef,
  source: number,
  openDoors: readonly number[],
  maxCost: number,
): number[] {
  const dist = new Array<number>(m.w * m.h).fill(Infinity);
  dist[source] = 0;

  // 간선 비용이 1 아니면 3뿐이므로 거리별 버킷(dial)이면 충분하다.
  // 매 pop 마다 정렬하면 O(V² log V) 가 되어 실시간에서 프레임을 잡아먹는다.
  const buckets: number[][] = Array.from({ length: maxCost + 4 }, () => []);
  buckets[0]!.push(source);

  for (let d = 0; d <= maxCost; d++) {
    const bucket = buckets[d];
    if (!bucket) continue;
    for (let i = 0; i < bucket.length; i++) {
      const cur = bucket[i]!;
      if (dist[cur]! < d) continue;
      for (const nb of neighbors(m, cur)) {
        if (m.kind[nb] === 'wall') continue;
        const isClosedDoor = m.kind[nb] === 'door' && !openDoors.includes(nb);
        const nd = d + (isClosedDoor ? 3 : 1);
        if (nd <= maxCost && nd < dist[nb]!) {
          dist[nb] = nd;
          buckets[nd]!.push(nb);
        }
      }
    }
  }
  return dist;
}

/** Bresenham 선분 위의 타일들(양 끝 제외) */
function line(m: MapDef, a: number, b: number): number[] {
  const p0 = xy(m, a);
  const p1 = xy(m, b);
  let { x: x0, y: y0 } = p0;
  const { x: x1, y: y1 } = p1;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const out: number[] = [];
  for (;;) {
    if (!(x0 === p0.x && y0 === p0.y) && !(x0 === x1 && y0 === y1)) out.push(idx(m, x0, y0));
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return out;
}

/**
 * 가시성 판정. ★ 항상 '관찰자 → 대상' 순서로만 계산한다.
 * los(a,b) || los(b,a) 같은 편법은 규칙을 설명 불가능하게 만들므로 쓰지 않는다.
 */
export function hasLos(m: MapDef, from: number, to: number, openDoors: readonly number[]): boolean {
  for (const t of line(m, from, to)) {
    if (blocksSight(m, t, openDoors)) return false;
  }
  return true;
}

export function chebyshev(m: MapDef, a: number, b: number): number {
  const pa = xy(m, a);
  const pb = xy(m, b);
  return Math.max(Math.abs(pa.x - pb.x), Math.abs(pa.y - pb.y));
}

/** 관찰자 기준 360도 반경 시야 */
export function visibleFrom(
  m: MapDef,
  origin: number,
  radius: number,
  openDoors: readonly number[],
): number[] {
  const out: number[] = [origin];
  for (let t = 0; t < m.w * m.h; t++) {
    if (t === origin) continue;
    if (chebyshev(m, origin, t) > radius) continue;
    if (hasLos(m, origin, t, openDoors)) out.push(t);
  }
  return out;
}

/**
 * 좀비 시야 — 전방 원뿔 + 근접 360도.
 * 플레이어에게 원뿔을 주면 '회전'이 턴을 먹어 조작 짜증이 극심하다.
 * 반대로 좀비가 원뿔이어야 "뒤로 돌아 들어가기"라는 잠입의 핵심 동사가 성립한다.
 */
export function zombieSees(
  m: MapDef,
  from: number,
  facing: string,
  to: number,
  openDoors: readonly number[],
  cfg: { sight: number; nearSight: number; coneCos: number },
): boolean {
  const d = chebyshev(m, from, to);
  if (d === 0) return true;
  if (d > cfg.sight) return false;
  if (!hasLos(m, from, to, openDoors)) return false;
  if (d <= cfg.nearSight) return true;

  const a = xy(m, from);
  const b = xy(m, to);
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len = Math.hypot(vx, vy) || 1;
  const f = FACING_VEC[facing]!;
  const cos = (vx / len) * f[0] + (vy / len) * f[1];
  return cos >= cfg.coneCos;
}

/**
 * 방 구획 — 문을 벽으로 취급해 flood fill.
 * 경로 자동 중단의 "새 방 진입" 판정에 쓴다.
 */
export function computeRooms(m: MapDef): number[] {
  const room = new Array<number>(m.w * m.h).fill(-1);
  let id = 0;
  for (let s = 0; s < m.w * m.h; s++) {
    if (room[s] !== -1) continue;
    const k = m.kind[s]!;
    if (k === 'wall' || k === 'door') continue;
    const stack = [s];
    room[s] = id;
    while (stack.length) {
      const cur = stack.pop()!;
      for (const nb of neighbors(m, cur)) {
        if (room[nb] !== -1) continue;
        const nk = m.kind[nb]!;
        if (nk === 'wall' || nk === 'door') continue;
        room[nb] = id;
        stack.push(nb);
      }
    }
    id++;
  }
  return room;
}
