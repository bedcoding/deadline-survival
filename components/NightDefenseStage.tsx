'use client';

import { laneName } from '@/engine/night';
import type { NightAction, NightDefenseState, NightLaneId } from '@/engine/night';
import { GAME_CONTENT } from '@/content/gameContent';

const LANE_COPY: Record<NightLaneId, { key: string; detail: string }> = {
  front: { key: 'A', detail: '가장 넓고 빠르게 무너진다' },
  vent: { key: 'S', detail: '좁지만 소리가 늦게 들린다' },
  service: { key: 'D', detail: '시야 밖에서 압력이 올라온다' },
};

type Props = {
  state: NightDefenseState;
  paused: boolean;
  onSelectLane: (lane: NightLaneId) => void;
  onAction: (action: NightAction) => void;
  onTogglePause: () => void;
  onNextDay: () => void;
  onRestart: () => void;
  onExitToMenu?: () => void;
};

export default function NightDefenseStage({
  state,
  paused,
  onSelectLane,
  onAction,
  onTogglePause,
  onNextDay,
  onRestart,
  onExitToMenu,
}: Props) {
  const remainingMs = Math.max(0, state.durationMs - state.timeMs);
  const remaining = `${Math.floor(remainingMs / 60000).toString().padStart(2, '0')}:${Math.ceil((remainingMs % 60000) / 1000).toString().padStart(2, '0')}`;
  const selected = state.lanes.find((lane) => lane.id === state.selectedLane) ?? state.lanes[0];
  const cooldown = state.timeMs < state.actionCooldownUntilMs;

  return (
    <main className={`night-defense-shell wave-${state.wave} ${paused ? 'is-paused' : ''}`}>
      <header className="night-defense-header">
        <div>
          <p>귀환 후 방어</p>
          <h1>컷 밖의 밤</h1>
        </div>
        <section className="night-threat-summary" aria-label={`야간 위협 ${state.threat}`}>
          <span>낮에 남긴 흔적</span>
          <div><i style={{ width: `${state.threat}%` }} /></div>
          <strong>{state.threat}</strong>
        </section>
        <div className="night-defense-clock">
          <span>{state.wave}차 공세</span>
          <strong>{remaining}</strong>
        </div>
      </header>

      <section className="night-defense-layout">
        <div className="night-defense-scene">
          <header className="defense-brief">
            <div>
              <span>현재 방어</span>
              <strong>{laneName(state.selectedLane)}</strong>
            </div>
            <p>한 통로를 직접 지키는 동안 그곳의 바리케이드 피해가 줄어든다.</p>
            <div className="core-health" aria-label={`작업실 방어선 ${state.coreHp}`}>
              <span>작업실 방어선</span>
              <div>{Array.from({ length: state.coreMaxHp }, (_, index) => <i key={index} className={index < state.coreHp ? 'full' : ''} />)}</div>
            </div>
          </header>

          <div className="defense-lanes">
            {state.lanes.map((lane) => {
              const active = lane.id === state.selectedLane;
              const sealed = state.timeMs < lane.sealedUntilMs;
              const diverted = state.timeMs < lane.divertedUntilMs;
              const barrierPercent = Math.max(0, Math.min(100, (lane.barrier / lane.maxBarrier) * 100));
              return (
                <button
                  key={lane.id}
                  type="button"
                  className={`defense-lane ${active ? 'active' : ''} ${sealed ? 'sealed' : ''} ${diverted ? 'diverted' : ''}`}
                  onClick={() => onSelectLane(lane.id)}
                  aria-pressed={active}
                  disabled={Boolean(state.over)}
                >
                  <header>
                    <kbd>{LANE_COPY[lane.id].key}</kbd>
                    <span>{laneName(lane.id)}</span>
                    <strong>{lane.pressure}</strong>
                  </header>
                  <div className="lane-window">
                    <span className="lane-depth" />
                    <img src={GAME_CONTENT.enemies.walker.fieldSprite} alt="바리케이드 밖의 마감 감염자" />
                    <i className="lane-crowd crowd-one" />
                    <i className="lane-crowd crowd-two" />
                    <b className="lane-barricade"><i style={{ width: `${barrierPercent}%` }} /></b>
                    {sealed && <em>셔터 작동</em>}
                    {diverted && !sealed && <em>업무폰 유인 중</em>}
                  </div>
                  <div className="lane-status">
                    <span>{LANE_COPY[lane.id].detail}</span>
                    <strong>{Math.ceil(lane.barrier)}<small> / {lane.maxBarrier}</small></strong>
                  </div>
                </button>
              );
            })}

            <div className={`defender-position lane-${state.selectedLane}`} aria-hidden="true">
              <img src={GAME_CONTENT.player.combatSprite} alt="" />
              <span>{laneName(state.selectedLane)} 방어 중</span>
            </div>
          </div>

          <footer className="defense-console">
            <div className="defense-log">
              <span>현장 기록</span>
              <p>{state.log.at(-1)?.msg}</p>
            </div>
            <div className="defense-actions">
              <button type="button" disabled={Boolean(state.over) || cooldown || state.materials <= 0 || selected.barrier >= selected.maxBarrier} onClick={() => onAction('repair')}>
                <kbd>SPACE</kbd><strong>바리케이드 수리</strong><span>자재 {state.materials}</span>
              </button>
              <button type="button" disabled={Boolean(state.over) || cooldown || state.decoys <= 0} onClick={() => onAction('decoy')}>
                <kbd>Q</kbd><strong>업무폰 유인</strong><span>남은 수량 {state.decoys}</span>
              </button>
              <button type="button" disabled={Boolean(state.over) || cooldown || state.cells <= 0} onClick={() => onAction('seal')}>
                <kbd>E</kbd><strong>방화 셔터</strong><span>배터리 {state.cells}</span>
              </button>
            </div>
          </footer>
        </div>

        <aside className="night-defense-rail">
          <section>
            <span>공세 정보</span>
            <strong>{state.wave}<small> / 3</small></strong>
            <p>{state.wave === 1 ? '흩어진 발소리' : state.wave === 2 ? '두 통로 동시 압박' : '마지막 총공세'}</p>
          </section>
          <section>
            <span>선택 통로</span>
            <strong>{laneName(state.selectedLane)}</strong>
            <p>직접 대응 피해 감소</p>
          </section>
          <button type="button" onClick={onTogglePause}><b>{paused ? '▶' : 'Ⅱ'}</b><span>{paused ? '계속' : '정지'}</span><kbd>ESC</kbd></button>
        </aside>

        {paused && !state.over && <div className="night-pause-card">방어 일시 정지</div>}
        {state.over && (
          <div className={`night-result-card ${state.over}`}>
            <span>{state.over === 'survived' ? '새벽 생존 기록' : '방어선 붕괴'}</span>
            <h2>{state.over === 'survived' ? '오늘 밤도 원고를 지켰다' : '작업실까지 뚫렸다'}</h2>
            <p>{state.over === 'survived' ? `총 ${state.lanes.reduce((sum, lane) => sum + lane.breaches, 0)}번의 돌파를 버티고 다음 원정을 준비한다.` : '낮의 흔적이 너무 짙었다. 이동과 소음을 줄여 다시 귀환해야 한다.'}</p>
            <div>
              {state.over === 'survived' && <button type="button" onClick={onNextDay}>다음 날 준비</button>}
              <button type="button" onClick={onRestart}>처음부터</button>
              {onExitToMenu && <button type="button" onClick={onExitToMenu}>메인 메뉴</button>}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
