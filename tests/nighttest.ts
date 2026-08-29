import assert from 'node:assert/strict';
import balanceJson from '../balance.json';
import type { Balance } from '../engine/balance';
import {
  applyNightAction,
  deriveNightThreat,
  newNightDefense,
  selectNightLane,
  stepNightDefense,
} from '../engine/night';
import type { RtState } from '../engine/rt';

const balance = balanceJson as unknown as Balance;
let passed = 0;

function test(name: string, run: () => void) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

const day = (overrides: Partial<RtState> = {}) => ({
  timeMs: 30000,
  player: { bitten: false },
  stats: { steps: 0, noisyEvents: 0, spotted: 0, decoysUsed: 0, woke: 0 },
  ...overrides,
}) as RtState;

test('낮의 소음과 발각은 밤 위협을 높인다', () => {
  const quiet = deriveNightThreat(day(), balance.night);
  const loud = deriveNightThreat(day({
    stats: { steps: 0, noisyEvents: 3, spotted: 1, decoysUsed: 0, woke: 2 },
  }), balance.night);
  assert.ok(loud > quiet);
});

test('배터리와 남은 업무폰이 야간 자원으로 이어진다', () => {
  const state = newNightDefense({ threat: 20, carried: ['태블릿배터리'], decoys: 2 }, balance.night);
  assert.equal(state.cells, 2);
  assert.equal(state.decoys, 2);
  assert.equal(state.materials, balance.night.baseMaterials);
});

test('직접 지키는 통로는 같은 시간 동안 피해를 덜 받는다', () => {
  const active = newNightDefense({ threat: 50, carried: [], decoys: 0 }, balance.night);
  const passive = newNightDefense({ threat: 50, carried: [], decoys: 0 }, balance.night);
  selectNightLane(active, 'front');
  selectNightLane(passive, 'vent');
  for (let i = 0; i < 50; i += 1) {
    stepNightDefense(active, 100, balance.night);
    stepNightDefense(passive, 100, balance.night);
  }
  assert.ok(active.lanes[0].barrier > passive.lanes[0].barrier);
});

test('수리는 자재를 쓰고 선택 통로의 내구도를 회복한다', () => {
  const state = newNightDefense({ threat: 30, carried: [], decoys: 0 }, balance.night);
  state.lanes[0].barrier = 40;
  const materials = state.materials;
  assert.equal(applyNightAction(state, 'repair', balance.night), true);
  assert.equal(state.materials, materials - 1);
  assert.ok(state.lanes[0].barrier > 40);
});

test('업무폰과 배터리 셔터는 선택 통로의 압력을 낮춘다', () => {
  const state = newNightDefense({ threat: 60, carried: ['태블릿배터리'], decoys: 1 }, balance.night);
  assert.equal(applyNightAction(state, 'decoy', balance.night), true);
  stepNightDefense(state, 100, balance.night);
  assert.ok(state.lanes[0].pressure < 20);
  state.timeMs = state.actionCooldownUntilMs;
  assert.equal(applyNightAction(state, 'seal', balance.night), true);
  stepNightDefense(state, 100, balance.night);
  assert.equal(state.lanes[0].pressure, 0);
});

test('방어 시간이 끝나면 생존으로 종료된다', () => {
  const safeCfg = { ...balance.night, pressureDamagePerSecond: 0 };
  const state = newNightDefense({ threat: 0, carried: [], decoys: 0 }, safeCfg);
  for (let time = 0; time <= safeCfg.durationMs; time += 100) stepNightDefense(state, 100, safeCfg);
  assert.equal(state.over, 'survived');
});

console.log(`\n${passed} night-defense tests passed.`);
