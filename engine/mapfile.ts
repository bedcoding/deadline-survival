import { readFileSync } from 'node:fs';
import type { Facing, ItemDef, MapDef, TileKind, ZombieDef, ZombieKind } from './types';

const CHAR_TO_KIND: Record<string, TileKind> = {
  '#': 'wall',
  '.': 'floor',
  D: 'door',
  '~': 'glass',
  '=': 'shelf',
  '@': 'floor',
  '!': 'floor',
};

/**
 * ASCII 지형(계산용) + 헤더(웨이포인트·좀비·아이템) 2층 구조 파서.
 * 웨이포인트는 게임 규칙이 아니라 클릭 지점이므로 지형과 분리해서 둔다.
 */
export function loadMap(path: string): MapDef {
  const raw = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const sections = new Map<string, string[]>();
  let current = '';

  // 맵 행은 전부 '#'로 시작하므로 주석과 접두사로는 구분할 수 없다.
  // 대신 "허용된 타일 문자만으로 이루어진 줄"인지로 판별한다.
  const isMapRow = (s: string) => s.length > 0 && [...s].every((c) => c in CHAR_TO_KIND);

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('@')) {
      current = trimmed.slice(1);
      sections.set(current, []);
      continue;
    }
    if (!current) continue;
    if (trimmed.length === 0) continue;

    if (current === 'map') {
      if (isMapRow(trimmed)) sections.get(current)!.push(trimmed);
      continue; // 그 외는 주석
    }
    if (!trimmed.startsWith('#')) sections.get(current)!.push(trimmed);
  }

  const mapRows = sections.get('map') ?? [];
  if (mapRows.length === 0) throw new Error('맵 섹션이 비어 있다');
  const h = mapRows.length;
  const w = mapRows[0]!.length;
  for (const [i, row] of mapRows.entries()) {
    if (row.length !== w) {
      throw new Error(`맵 ${i}행의 길이가 ${row.length}. 모든 행이 ${w}자여야 한다.`);
    }
  }

  const kind: TileKind[] = new Array(w * h);
  let start = -1;
  let exit = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = mapRows[y]![x]!;
      const k = CHAR_TO_KIND[ch];
      if (!k) throw new Error(`알 수 없는 타일 문자 '${ch}' at ${y},${x}`);
      kind[y * w + x] = k;
      if (ch === '@') start = y * w + x;
      if (ch === '!') exit = y * w + x;
    }
  }
  if (start < 0) throw new Error('시작 지점 @ 가 없다');
  if (exit < 0) throw new Error('출구 ! 가 없다');

  const meta = { turns: 18, dusk: 12, night: 16 };
  for (const line of sections.get('meta') ?? []) {
    const [k, v] = line.split(/\s+/);
    if (k === 'turns') meta.turns = Number(v);
    if (k === 'dusk') meta.dusk = Number(v);
    if (k === 'night') meta.night = Number(v);
  }

  const waypoints = (sections.get('waypoints') ?? []).map((line) => {
    const [name, y, x] = line.split(/\s+/);
    return { name: name!, tile: Number(y) * w + Number(x) };
  });

  const zombies: ZombieDef[] = (sections.get('zombies') ?? []).map((line) => {
    const parts = line.split(/\s+/);
    let rawKind = parts[0]!;
    const dormant = rawKind.endsWith('!');
    if (dormant) rawKind = rawKind.slice(0, -1);
    const kindName = rawKind as ZombieKind;
    const sy = Number(parts[1]);
    const sx = Number(parts[2]);
    const facing = parts[3] as Facing;
    const patrol = parts.slice(4).map((p) => {
      const [py, px] = p.split(',');
      return Number(py) * w + Number(px);
    });
    return { kind: kindName, start: sy * w + sx, facing, patrol, dormant };
  });

  const items: ItemDef[] = (sections.get('items') ?? []).map((line) => {
    const [name, y, x, slot] = line.split(/\s+/);
    return { name: name!, tile: Number(y) * w + Number(x), slot: (slot as 'large' | 'small') ?? 'small' };
  });

  return { w, h, kind, start, exit, waypoints, zombies, items, meta };
}
