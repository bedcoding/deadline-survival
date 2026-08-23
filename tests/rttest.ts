import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadMap } from '../engine/mapfile';
import { newRt, stepRt, DEFAULT_CFG, finishCombat } from '../engine/rt';
import { resolveCombatAction, resolveCombatDefense } from '../engine/combat';
import { idx, xy } from '../engine/geom';
import type { RtState, RtInput } from '../engine/rt';
import type { Balance } from '../engine/balance';

/** 실시간판 규칙 계약 — 화면을 못 봐도 확인할 수 있는 것들 */

const ROOT = new URL('..', import.meta.url);
const bal: Balance = JSON.parse(readFileSync(fileURLToPath(new URL('balance.json', ROOT)), 'utf8'));
const m = loadMap(fileURLToPath(new URL('maps/mart.map', ROOT)));
const cfg = DEFAULT_CFG;

let pass = 0;
let fail = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (e) {
    fail++;
    console.log(`  \x1b[31m✗ ${name}\x1b[0m`);
    console.log(`      ${(e as Error).message}`);
  }
}
const assert = (c: boolean, msg: string) => {
  if (!c) throw new Error(msg);
};

const IN = (o: Partial<RtInput> = {}): RtInput => ({ dir: null, gait: 'walk', act: false, decoy: false, hide: false, calm: false, ...o });

/** ms 만큼 16.7ms 프레임으로 굴린다 */
function run(st: RtState, ms: number, input: RtInput) {
  for (let i = 0; i < Math.round(ms / 16.7); i++) stepRt(m, bal, st, input, 16.7, cfg);
}

console.log('\n=== 실시간판 규칙 계약 ===\n');

t('맵: 동면 좀비가 실제로 배치돼 있다', () => {
  const st = newRt(m, bal);
  const dormant = st.zombies.filter((z) => z.dormant);
  const active = st.zombies.filter((z) => !z.dormant);
  assert(dormant.length >= 3, `동면 좀비가 ${dormant.length}마리뿐이다`);
  assert(active.length >= 2, `순찰 좀비가 ${active.length}마리뿐이다`);
});

t('★ 특수 추적자: shadow 타입이 일반 좀비와 별도로 배치된다', () => {
  const st = newRt(m, bal);
  const shadow = st.zombies.find((zombie) => zombie.kind === 'shadow');
  assert(Boolean(shadow), '맵에 shadow 추적자가 없다');
  assert(Boolean(bal.zombies.shadow), 'shadow 밸런스 항목이 연결되지 않았다');
});

t('★ 마감 시나리오: 최종 원고와 업무폰이 실제 맵 아이템으로 배치된다', () => {
  const names = new Set(m.items.map((item) => item.name));
  assert(names.has('최종원고'), '맵에 최종 원고가 없다');
  assert(names.has('업무폰'), '맵에 업무폰이 없다');
});

t('★ 업로드 단말기: 최종 원고 없이는 탈출할 수 없다', () => {
  const exit = xy(m, m.exit);
  const from = idx(m, exit.x - 1, exit.y);
  const withoutProof = newRt(m, bal);
  withoutProof.zombies = [];
  withoutProof.player.tile = from;
  withoutProof.player.from = from;
  run(withoutProof, 300, IN({ dir: 'E' }));
  assert(withoutProof.over === null, '최종 원고가 없는데도 업로드가 완료됐다');

  const withProof = newRt(m, bal);
  withProof.zombies = [];
  withProof.carried.push('최종원고');
  withProof.player.tile = from;
  withProof.player.from = from;
  run(withProof, 300, IN({ dir: 'E' }));
  assert(withProof.over === 'escaped', '최종 원고를 가진 채 단말기에 도착해도 업로드되지 않았다');
});

t('★ 인지 지연: 시야에 들어가도 즉시 발각되지 않는다', () => {
  const st = newRt(m, bal);
  const z = st.zombies.find((x) => !x.dormant)!;
  // 좀비 정면 3칸 앞에 세운다 (5행 통로, 시야 트임)
  const p = xy(m, z.tile);
  z.facing = 'E';
  z.wanders = false; // 배회 정지 — 인지만 본다
  st.player.tile = idx(m, p.x + 3, p.y);
  st.player.from = st.player.tile;

  let ms = 0;
  while (z.state !== 'CHASE' && ms < 6000) {
    stepRt(m, bal, st, IN(), 16.7, cfg);
    ms += 16.7;
  }
  assert(z.state === 'CHASE', '6초가 지나도 발각되지 않았다 — 시야가 아예 안 닿는다');
  assert(ms > 350, `${ms.toFixed(0)}ms 만에 발각됐다 — 즉시 발각과 다름없다`);
  assert(ms < 3000, `${ms.toFixed(0)}ms 나 걸렸다 — 너무 느슨하다`);
});

t('★ 인지 지연: 달리면 걷기보다 빨리 발각된다', () => {
  const measure = (gait: RtInput['gait']) => {
    const st = newRt(m, bal);
    const z = st.zombies.find((x) => !x.dormant)!;
    const p = xy(m, z.tile);
    z.facing = 'E';
    z.wanders = false;
    st.player.tile = idx(m, p.x + 3, p.y);
    st.player.from = st.player.tile;
    let ms = 0;
    while (z.state !== 'CHASE' && ms < 9000) {
      stepRt(m, bal, st, IN({ gait }), 16.7, cfg);
      ms += 16.7;
    }
    return ms;
  };
  const walk = measure('walk');
  const runv = measure('run');
  assert(runv < walk, `달리기 ${runv.toFixed(0)}ms vs 걷기 ${walk.toFixed(0)}ms — 달려도 안 빨리 들킨다`);
});

t('★ 동면: 멈춰 있으면 끝까지 깨지 않는다', () => {
  const st = newRt(m, bal);
  const dz = st.zombies.find((z) => z.dormant)!;
  const p = xy(m, dz.tile);
  // 동면 좀비 옆에 있어도 움직이지 않으면 소리를 내지 않는다.
  st.player.tile = idx(m, p.x - 2, p.y);
  st.player.from = st.player.tile;
  run(st, 3000, IN());
  assert(dz.dormant, '가만히 있었는데 깼다');
  assert(st.stats.woke === 0, `${st.stats.woke}마리가 깼다`);
});

t('★ 동면: 달려서 지나가면 깬다', () => {
  const st = newRt(m, bal);
  const dz = st.zombies.find((z) => z.dormant)!;
  const p = xy(m, dz.tile);
  st.player.tile = idx(m, p.x - 2, p.y);
  st.player.from = st.player.tile;
  run(st, 2000, IN({ dir: 'E', gait: 'run' }));
  assert(!dz.dormant, '달렸는데도 안 깼다 — 소음이 안 닿는다');
});

t('★ 동면: 자는 좀비는 위험 칸을 만들지 않는다', () => {
  const st = newRt(m, bal);
  // 순찰 좀비를 전부 재워서 위험 칸이 0 이 되는지 본다
  for (const z of st.zombies) z.dormant = true;
  run(st, 300, IN());
  assert(st.danger.length === 0, `자는 좀비만 있는데 위험 칸이 ${st.danger.length}개다`);
});

t('★ 신음: 순찰 좀비는 소리를 내고, 자는 좀비는 안 낸다', () => {
  const st = newRt(m, bal);
  // 순찰 좀비 옆으로 플레이어를 옮겨 들리게 한다
  const z = st.zombies.find((x) => !x.dormant)!;
  const p = xy(m, z.tile);
  st.player.tile = idx(m, p.x + 2, p.y);
  st.player.from = st.player.tile;
  run(st, 5000, IN());
  const groans = st.noises.filter((n) => n.src === 'zombie');
  assert(st.stats.steps === 0, '플레이어가 움직였다 — 순수 신음 테스트가 아니다');
  assert(groans.length > 0 || st.noises.some((n) => n.src === 'zombie'), '5초 동안 신음이 하나도 없다');

  const st2 = newRt(m, bal);
  for (const zz of st2.zombies) zz.dormant = true;
  run(st2, 5000, IN());
  assert(
    !st2.noises.some((n) => n.src === 'zombie'),
    '전원 동면인데 신음이 발생했다',
  );
});

t('속도: 순찰 좀비가 플레이어 걷기보다 확실히 느리다', () => {
  const walk = cfg.gaitMs.walk;
  assert(cfg.zombieMs.idle > walk * 3, `순찰 ${cfg.zombieMs.idle}ms vs 걷기 ${walk}ms — 3배 이상 느려야 한다`);
  assert(cfg.zombieMs.chase > walk, `추격 ${cfg.zombieMs.chase}ms 가 걷기 ${walk}ms 보다 빠르다 — 못 도망친다`);
  assert(cfg.zombieMs.chase > cfg.gaitMs.run, `추격 ${cfg.zombieMs.chase}ms 가 달리기 ${cfg.gaitMs.run}ms 보다 빠르다 — 질주로 거리를 못 벌린다`);
});

t('★ 배회: 시드가 다르면 좀비의 이동 경로도 달라진다', () => {
  const route = (seed: number) => {
    const st = newRt(m, bal, cfg, seed);
    const z = st.zombies.find((item) => !item.dormant)!;
    st.zombies = [z];
    st.player.hidden = true;
    const tiles: number[] = [];
    for (let i = 0; i < 7; i++) {
      run(st, 700, IN());
      tiles.push(z.tile);
    }
    return tiles.join(',');
  };
  const first = route(11);
  const second = route(97);
  assert(first !== second, `서로 다른 시드의 경로가 같다: ${first}`);
});

t('★ 숨기: 진열대 옆에서 숨으면 떨어진 좀비의 시야를 피한다', () => {
  const st = newRt(m, bal, cfg, 1);
  const z = st.zombies.find((item) => !item.dormant)!;
  st.zombies = [z];
  z.tile = idx(m, 1, 5);
  z.from = z.tile;
  z.facing = 'N';
  z.wanders = false;
  z.state = 'IDLE';
  z.alert = 0;
  st.player.tile = idx(m, 1, 2);
  st.player.from = st.player.tile;

  stepRt(m, bal, st, IN({ hide: true }), 16.7, cfg);
  assert(st.player.hidden, '진열대 옆인데 숨기 상태가 되지 않았다');
  stepRt(m, bal, st, IN({ act: true }), 16.7, cfg);
  assert(st.player.hidden, 'Space 행동키를 눌렀더니 은신이 풀렸다');
  assert(st.player.actKind === null, '은신 중 Space 행동이 실행됐다');
  run(st, 2400, IN());
  const hiddenState: string = z.state;
  assert(hiddenState !== 'CHASE', '숨었는데 떨어진 좀비에게 발각됐다');

  stepRt(m, bal, st, IN({ hide: true }), 16.7, cfg);
  assert(!st.player.hidden, '숨기 해제가 되지 않았다');
  run(st, 2400, IN());
  const revealedState: string = z.state;
  assert(revealedState === 'CHASE', '숨은 곳에서 나왔는데도 좀비가 인식하지 못했다');
});

t('★ 숨기: 깨어 있는 좀비의 눈앞에서 숨으면 즉시 발각된다', () => {
  const st = newRt(m, bal, cfg, 3);
  const z = st.zombies.find((item) => !item.dormant)!;
  st.zombies = [z];
  st.player.tile = idx(m, 1, 2);
  st.player.from = st.player.tile;
  z.tile = idx(m, 1, 3);
  z.from = z.tile;
  z.facing = 'N';
  z.wanders = false;
  z.state = 'IDLE';
  z.alert = 0;

  stepRt(m, bal, st, IN({ hide: true }), 16.7, cfg);

  assert(!st.player.hidden, '좀비의 눈앞인데 은신에 성공했다');
  assert(z.alert === 100, `즉시 발각됐는데 경계가 100이 아니다: ${z.alert}`);
  const spottedState: string = z.state;
  assert(spottedState === 'CHASE', `발각 뒤 추격 상태가 아니다: ${spottedState}`);
});

t('★ 숨기: 등을 보인 좀비나 잠든 좀비 앞에서는 숨을 수 있다', () => {
  const behind = newRt(m, bal, cfg, 4);
  const awake = behind.zombies.find((item) => !item.dormant)!;
  behind.zombies = [awake];
  behind.player.tile = idx(m, 1, 2);
  behind.player.from = behind.player.tile;
  awake.tile = idx(m, 1, 3);
  awake.from = awake.tile;
  awake.facing = 'S';
  awake.wanders = false;
  awake.state = 'IDLE';
  awake.alert = 0;

  stepRt(m, bal, behind, IN({ hide: true }), 16.7, cfg);
  assert(behind.player.hidden, '등을 보인 좀비 옆인데 숨지 못했다');

  const sleeping = newRt(m, bal, cfg, 5);
  const dormant = sleeping.zombies.find((item) => item.dormant)!;
  sleeping.zombies = [dormant];
  sleeping.player.tile = idx(m, 1, 2);
  sleeping.player.from = sleeping.player.tile;
  dormant.tile = idx(m, 1, 3);
  dormant.from = dormant.tile;
  dormant.facing = 'N';

  stepRt(m, bal, sleeping, IN({ hide: true }), 16.7, cfg);
  assert(sleeping.player.hidden, '잠든 좀비 앞인데 숨지 못했다');
});

t('★ 숨기: 인접한 좀비의 경계는 천천히 오르고 즉시 전투가 나지 않는다', () => {
  const st = newRt(m, bal, cfg, 5);
  const z = st.zombies.find((item) => !item.dormant)!;
  st.zombies = [z];
  st.player.tile = idx(m, 1, 2);
  st.player.from = st.player.tile;
  st.player.hidden = true;
  z.tile = idx(m, 1, 3);
  z.from = z.tile;
  z.facing = 'N';
  z.wanders = false;
  z.state = 'IDLE';
  z.alert = 0;

  run(st, 3000, IN());

  assert(st.player.hidden, '기다리는 동안 은신이 풀렸다');
  const adjacentState: string = z.state;
  assert(adjacentState !== 'CHASE', '바로 옆 좀비가 숨은 플레이어를 시야로 발견했다');
  assert(z.alert >= 45 && z.alert <= 70, `3초 뒤 경계가 예상 범위를 벗어났다: ${z.alert.toFixed(1)}`);
  assert(z.tile === st.player.tile, '의심한 좀비가 은신처 위치까지 확인하러 오지 않았다');
  assert(st.combat === null, '숨은 상태인데 접촉 전투가 시작됐다');
});

t('★ 의심: 배회를 멈춘 좀비도 마지막으로 본 위치를 향해 접근한다', () => {
  const st = newRt(m, bal, cfg, 12);
  const z = st.zombies.find((item) => !item.dormant)!;
  st.zombies = [z];
  st.player.tile = idx(m, 1, 2);
  st.player.from = st.player.tile;
  st.player.hidden = true;
  z.tile = idx(m, 1, 5);
  z.from = z.tile;
  z.facing = 'N';
  z.wanders = false;
  z.state = 'SUSPICIOUS';
  z.target = st.player.tile;
  z.alert = 26;
  const before = Math.abs(xy(m, z.tile).y - xy(m, st.player.tile).y);

  run(st, 600, IN());

  const after = Math.abs(xy(m, z.tile).y - xy(m, st.player.tile).y);
  assert(after < before, `의심 상태인데 마지막 위치로 접근하지 않았다: ${before} → ${after}`);
  const approachingState: string = z.state;
  assert(approachingState !== 'IDLE', '마지막 위치에 도착하기 전에 의심을 풀고 돌아갔다');
});

t('★ 숨 참기: Space를 누르는 동안 인접 좀비의 경계가 감소한다', () => {
  const st = newRt(m, bal, cfg, 6);
  const z = st.zombies.find((item) => !item.dormant)!;
  st.zombies = [z];
  st.player.tile = idx(m, 1, 2);
  st.player.from = st.player.tile;
  st.player.hidden = true;
  z.tile = idx(m, 1, 3);
  z.from = z.tile;
  z.facing = 'N';
  z.wanders = false;
  z.state = 'IDLE';
  z.alert = 0;

  run(st, 2000, IN());
  const before = z.alert;
  run(st, 1000, IN({ act: true }));

  assert(before >= 30, `숨을 참기 전 경계가 충분히 오르지 않았다: ${before.toFixed(1)}`);
  assert(st.player.holdingBreath, 'Space를 누르고 있는데 숨 참기 상태가 아니다');
  assert(z.alert < before, `숨을 참아도 경계가 감소하지 않았다: ${before.toFixed(1)} → ${z.alert.toFixed(1)}`);
  assert(st.player.hidden, '숨을 참는 동안 은신이 풀렸다');
});

t('★ 숨 참기: 폐활량이 바닥나면 강제로 숨을 내쉬고 Space를 놓아야 한다', () => {
  const st = newRt(m, bal, cfg, 61);
  const z = st.zombies.find((item) => !item.dormant)!;
  st.zombies = [z];
  st.player.tile = idx(m, 1, 2);
  st.player.from = st.player.tile;
  st.player.hidden = true;
  z.tile = idx(m, 1, 3);
  z.from = z.tile;
  z.facing = 'N';
  z.wanders = false;
  z.state = 'IDLE';
  z.alert = 0;

  run(st, 5200, IN({ act: true }));

  assert(st.events.some((event) => event.type === 'breath-gasp'), '폐활량이 바닥났는데 숨 터짐 사건이 없다');
  assert(st.player.breathNeedsRelease, '숨이 터진 뒤에도 Space 재입력 제한이 없다');
  assert(!st.player.holdingBreath, '숨이 터졌는데도 계속 숨을 참고 있다');
  const recovering = st.player.breath;

  run(st, 500, IN({ act: true }));
  assert(!st.player.holdingBreath, 'Space를 놓지 않았는데 다시 숨 참기가 시작됐다');
  run(st, 1000, IN());
  assert(!st.player.breathNeedsRelease, 'Space를 놓았는데 재입력 제한이 풀리지 않았다');
  assert(st.player.breath > recovering, 'Space를 놓아도 폐활량이 회복되지 않았다');
});

t('★ 호흡 연장: 숨을 참는 중에는 타이밍 없이 버튼 입력으로 즉시 회복한다', () => {
  const st = newRt(m, bal, cfg, 62);
  const z = st.zombies.find((item) => !item.dormant)!;
  st.zombies = [z];
  st.player.tile = idx(m, 1, 2);
  st.player.from = st.player.tile;
  st.player.hidden = true;
  z.tile = idx(m, 1, 3);
  z.from = z.tile;
  z.facing = 'N';
  z.wanders = false;
  z.state = 'IDLE';

  run(st, 1000, IN({ act: true }));
  const before = st.player.breath;
  stepRt(m, bal, st, IN({ act: true, calm: true }), 16.7, cfg);

  assert(st.player.calmFeedback === 'success', '호흡 연장 버튼을 눌렀는데 회복되지 않았다');
  assert(st.player.breath > before, `버튼 입력 뒤 숨이 늘지 않았다: ${before.toFixed(1)} → ${st.player.breath.toFixed(1)}`);
});

t('★ 호흡 연장: 버튼은 횟수 제한이나 누적 페널티 없이 반복 사용할 수 있다', () => {
  const st = newRt(m, bal, cfg, 63);
  const z = st.zombies.find((item) => !item.dormant)!;
  st.zombies = [z];
  st.player.tile = idx(m, 1, 2);
  st.player.from = st.player.tile;
  st.player.hidden = true;
  z.tile = idx(m, 1, 3);
  z.from = z.tile;
  z.facing = 'N';
  z.wanders = false;
  z.state = 'IDLE';

  for (let i = 0; i < 12; i++) {
    run(st, 400, IN({ act: true }));
    stepRt(m, bal, st, IN({ act: true, calm: true }), 16.7, cfg);
  }

  assert(st.player.holdingBreath, '버튼을 반복 사용했는데 숨 참기가 강제로 끝났다');
  assert(!st.events.some((event) => event.type === 'breath-gasp'), '반복 연장 중 숨 터짐이 발생했다');
  assert(st.events.filter((event) => event.type === 'breath-calm').length === 12, '버튼 반복 입력이 모두 처리되지 않았다');
});

t('★ 숨기: 인접한 채 숨을 참지 않으면 결국 발각된다', () => {
  const st = newRt(m, bal, cfg, 8);
  const z = st.zombies.find((item) => !item.dormant)!;
  st.zombies = [z];
  st.player.tile = idx(m, 1, 2);
  st.player.from = st.player.tile;
  st.player.hidden = true;
  z.tile = idx(m, 1, 3);
  z.from = z.tile;
  z.facing = 'N';
  z.wanders = false;
  z.state = 'IDLE';
  z.alert = 0;

  run(st, 5400, IN());

  assert(!st.player.hidden, '경계가 가득 찼는데도 은신이 유지됐다');
  const detectedState: string = z.state;
  assert(detectedState === 'CHASE', `발각 뒤 추격으로 전환되지 않았다: ${detectedState}`);
});

t('★ 숨기: 숨을 참으면 추적자가 은신처를 확인하고 지나갈 수 있다', () => {
  const st = newRt(m, bal, cfg, 7);
  const z = st.zombies.find((item) => !item.dormant)!;
  st.zombies = [z];
  st.player.tile = idx(m, 1, 2);
  st.player.from = st.player.tile;
  st.player.hidden = true;
  z.tile = idx(m, 1, 4);
  z.from = z.tile;
  z.facing = 'N';
  z.state = 'CHASE';
  z.target = st.player.tile;
  z.alert = 100;

  run(st, 3000, IN({ act: true }));

  assert(st.combat === null, '숨은 플레이어와 겹쳐 지나가며 전투가 시작됐다');
  assert(z.tile === st.player.tile, '숨은 플레이어가 길을 막아 좀비가 은신처에 들어오지 못했다');
  const searchState: string = z.state;
  assert(searchState === 'SEARCH', `은신처에서 수색 상태로 전환되지 않았다: ${searchState}`);

  run(st, 900, IN({ act: true }));
  assert(z.tile !== st.player.tile, '수색을 마친 좀비가 숨은 플레이어에게 막혀 지나가지 못했다');
  assert(st.combat === null, '숨은 플레이어를 지나간 뒤 전투가 시작됐다');
});

t('결정론: 같은 입력열이면 같은 결과', () => {
  const once = () => {
    const st = newRt(m, bal);
    for (let i = 0; i < 240; i++) {
      stepRt(m, bal, st, IN({ dir: i % 60 < 30 ? 'E' : 'S', gait: 'walk' }), 16.7, cfg);
    }
    return JSON.stringify({
      p: st.player.tile,
      z: st.zombies.map((z) => [z.tile, z.state, Math.round(z.alert)]),
    });
  };
  assert(once() === once(), '두 번 돌린 결과가 다르다');
});

t('진열대 부수기: 길과 시야가 뚫린다', () => {
  const st = newRt(m, bal);
  // 시작(1,1) 아래는 진열대가 아니라 통로다. 진열대 앞으로 옮긴다.
  st.player.tile = idx(m, 2, 1);
  st.player.from = st.player.tile;
  st.player.facing = 'S';
  const target = idx(m, 2, 2);
  assert(m.kind[target] === 'shelf', '테스트 지점이 진열대가 아니다');
  run(st, 1600, IN({ act: true }));
  assert(st.brokenShelves.includes(target), '1.6초 동안 눌렀는데 안 부서졌다');
});

function collideForCombat(st: RtState) {
  const z = st.zombies.find((zombie) => !zombie.dormant)!;
  z.tile = st.player.tile;
  z.from = z.tile;
  z.t = 0;
  z.state = 'CHASE';
  z.stunMs = 0;
  z.wanders = false;
  stepRt(m, bal, st, IN(), 16.7, cfg);
  assert(st.combat !== null, '같은 칸에서 전투가 시작되지 않았다');
  return z.id;
}

function guardPendingAttack(combat: NonNullable<RtState['combat']>) {
  return combat.awaitingDefense ? resolveCombatDefense(combat, 'guard', bal.combat) : combat;
}

t('★ 접촉 전투: 맞닿아도 필드에서 HP를 바로 깎지 않는다', () => {
  const st = newRt(m, bal, cfg, 31);
  const hp = st.player.hp;
  collideForCombat(st);
  assert(st.player.hp === hp, `전투 진입 전에 HP가 ${hp} → ${st.player.hp}로 줄었다`);
  assert(st.events.filter((event) => event.type === 'combat-start').length === 1, '전투 진입 이벤트가 한 번이 아니다');
});

t('★ 접촉 전투: 서로 반대편 칸으로 이동해도 경로를 교차해 통과하지 않는다', () => {
  const st = newRt(m, bal, cfg, 311);
  const z = st.zombies.find((zombie) => !zombie.dormant)!;
  const left = idx(m, 5, 1);
  const right = idx(m, 6, 1);

  st.player.from = left;
  st.player.tile = right;
  st.player.t = 0.54;
  st.player.facing = 'E';
  z.from = right;
  z.tile = left;
  z.t = 0.54;
  z.facing = 'W';
  z.state = 'CHASE';
  z.stunMs = 0;
  z.wanders = false;

  stepRt(m, bal, st, IN(), 16.7, cfg);
  assert(st.combat !== null, '이동 경로가 교차했는데 서로 통과했다');
  assert(st.combat?.retreatTile !== right, '교전 후 후퇴 지점이 충돌 칸으로 잡혔다');
});

t('★ 접촉 전투: 전투 중에는 필드 시간과 좀비 위치가 멈춘다', () => {
  const st = newRt(m, bal, cfg, 32);
  collideForCombat(st);
  const time = st.timeMs;
  const positions = st.zombies.map((zombie) => [zombie.tile, zombie.t]);
  run(st, 1800, IN({ dir: 'E', gait: 'run' }));
  assert(st.timeMs === time, `전투 중 시간이 ${time} → ${st.timeMs}로 흘렀다`);
  assert(JSON.stringify(st.zombies.map((zombie) => [zombie.tile, zombie.t])) === JSON.stringify(positions), '전투 중 좀비가 움직였다');
});

t('★ 부위 전투: 팔을 꺾으면 붙잡기를 확정적으로 막는다', () => {
  const st = newRt(m, bal, cfg, 33);
  collideForCombat(st);
  const combat = st.combat!;
  combat.intent = 'grab';
  const hpBefore = combat.enemyHp;
  const next = resolveCombatAction(combat, { type: 'attack', target: 'arms' }, bal.combat);
  assert(next.armsBroken, '팔 공격 뒤에도 팔이 멀쩡하다');
  assert(next.enemyHp === hpBefore - bal.combat.limbDamage, '팔을 공격했는데 공용 HP가 줄지 않았다');
  assert(!next.restrained, '팔을 망가뜨렸는데 붙잡혔다');
  assert(next.outcome === null, '팔만 공격했는데 전투가 끝났다');
});

t('★ 부위 전투: 다리 공격도 공용 HP를 깎고 도주 조건을 만든다', () => {
  const st = newRt(m, bal, cfg, 331);
  collideForCombat(st);
  const combat = st.combat!;
  combat.intent = 'lunge';
  const hpBefore = combat.enemyHp;
  const next = resolveCombatAction(combat, { type: 'attack', target: 'legs' }, bal.combat);
  assert(next.legsBroken, '다리 공격 뒤에도 다리가 멀쩡하다');
  assert(next.enemyHp === hpBefore - bal.combat.limbDamage, '다리를 공격했는데 공용 HP가 줄지 않았다');
  assert(next.outcome === null, '다리만 공격했는데 전투가 끝났다');
});

t('★ 부위 전투: 머리를 두 번 가격하면 대상 좀비만 제거된다', () => {
  const st = newRt(m, bal, cfg, 34);
  const enemyId = collideForCombat(st);
  const before = st.zombies.length;
  let combat = resolveCombatAction(st.combat!, { type: 'attack', target: 'arms' }, bal.combat);
  combat = guardPendingAttack(combat);
  combat = resolveCombatAction(combat, { type: 'attack', target: 'head' }, bal.combat);
  combat = guardPendingAttack(combat);
  if (combat.restrained) combat = resolveCombatAction(combat, { type: 'shove' }, bal.combat);
  combat = resolveCombatAction(combat, { type: 'attack', target: 'head' }, bal.combat);
  assert(combat.outcome === 'won', '머리 공격으로 공용 HP를 모두 깎았는데 승리하지 않았다');
  st.combat = combat;
  finishCombat(m, bal, st, cfg);
  assert(st.zombies.length === before - 1, '승리 뒤 좀비 수가 정확히 하나 줄지 않았다');
  assert(!st.zombies.some((zombie) => zombie.id === enemyId), '싸운 좀비가 필드에 남았다');
});

t('★ 부위 전투: 밀친 뒤 도주하면 즉시 재접촉하지 않는다', () => {
  const st = newRt(m, bal, cfg, 35);
  const enemyId = collideForCombat(st);
  let combat = resolveCombatAction(st.combat!, { type: 'shove' }, bal.combat);
  combat = resolveCombatAction(combat, { type: 'flee' }, bal.combat);
  assert(combat.outcome === 'fled', '거리를 벌렸는데 도주하지 못했다');
  st.combat = combat;
  finishCombat(m, bal, st, cfg);
  const enemy = st.zombies.find((zombie) => zombie.id === enemyId)!;
  assert(st.player.tile !== enemy.tile, '도주 뒤 플레이어와 좀비가 같은 칸이다');
  stepRt(m, bal, st, IN(), 16.7, cfg);
  assert(st.combat === null, '도주 직후 전투가 다시 열렸다');
});

t('★ 부위 전투: 물어뜯겨 체력이 0이면 필드 사망으로 이어진다', () => {
  const st = newRt(m, bal, cfg, 36);
  collideForCombat(st);
  st.combat!.playerHp = 1;
  st.combat!.intent = 'bite';
  let combat = resolveCombatAction(st.combat!, { type: 'attack', target: 'arms' }, bal.combat);
  assert(combat.awaitingDefense, '물어뜯기 전에 방어 입력 기회가 열리지 않았다');
  combat = resolveCombatDefense(combat, 'miss', bal.combat);
  assert(combat.outcome === 'dead', '체력 1에서 물렸는데 전투 사망이 아니다');
  assert(combat.playerBitten, '물어뜯겼는데 물림 상태가 기록되지 않았다');
  st.combat = combat;
  finishCombat(m, bal, st, cfg);
  assert(st.over === 'dead', '전투 사망이 필드 종료 상태로 이어지지 않았다');
});

t('★ 반응 방어: 적 피해는 예고가 끝나기 전에는 적용되지 않는다', () => {
  const st = newRt(m, bal, cfg, 37);
  collideForCombat(st);
  st.combat!.intent = 'bite';
  const hp = st.combat!.playerHp;
  const combat = resolveCombatAction(st.combat!, { type: 'attack', target: 'torso' }, bal.combat);

  assert(combat.awaitingDefense, '위험한 적 행동인데 방어 단계가 열리지 않았다');
  assert(combat.playerHp === hp, '방어 입력 전에 피해가 먼저 적용됐다');
  assert(!combat.playerBitten, '방어 입력 전에 물림 상태가 먼저 적용됐다');
});

t('★ 반응 방어: 일반 방어는 공격을 막지만 반격 피해는 주지 않는다', () => {
  const st = newRt(m, bal, cfg, 38);
  collideForCombat(st);
  st.combat!.intent = 'bite';
  const hp = st.combat!.playerHp;
  let combat = resolveCombatAction(st.combat!, { type: 'attack', target: 'arms' }, bal.combat);
  const enemyHp = combat.enemyHp;
  combat = resolveCombatDefense(combat, 'guard', bal.combat);

  assert(!combat.awaitingDefense, '방어 뒤에도 방어 단계가 닫히지 않았다');
  assert(combat.playerHp === hp, '일반 방어에 성공했는데 피해를 받았다');
  assert(!combat.playerBitten, '일반 방어에 성공했는데 물림 상태가 됐다');
  assert(combat.enemyHp === enemyHp, '일반 방어인데 반격 피해까지 들어갔다');
});

t('★ 반응 방어: 패링은 공격을 무효화하고 공용 HP에 반격 피해를 준다', () => {
  const st = newRt(m, bal, cfg, 39);
  collideForCombat(st);
  st.combat!.intent = 'lunge';
  const hp = st.combat!.playerHp;
  let combat = resolveCombatAction(st.combat!, { type: 'attack', target: 'torso' }, bal.combat);
  const enemyHp = combat.enemyHp;
  combat = resolveCombatDefense(combat, 'parry', bal.combat);

  assert(combat.playerHp === hp, '패링에 성공했는데 피해를 받았다');
  assert(combat.enemyHp === enemyHp - bal.combat.parryDamage, '패링 반격이 공용 HP를 깎지 않았다');
  assert(combat.distance === 'open', '패링 뒤 거리가 벌어지지 않았다');
  assert(combat.lastDefense === 'parry', '마지막 방어 결과가 패링으로 기록되지 않았다');
});

console.log(`\n  ${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
