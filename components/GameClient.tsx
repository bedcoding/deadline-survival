'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import CombatStage from './CombatStage';
import GameStage from './GameStage';
import { chebyshev } from '@/engine/geom';
import { resolveCombatAction, resolveCombatDefense } from '@/engine/combat';
import type { CombatAction, CombatPart, DefenseResult } from '@/engine/combat';
import { canHideAt, DEFAULT_CFG, finishCombat, newRt, stepRt } from '@/engine/rt';
import type { RtInput, RtState } from '@/engine/rt';
import type { Balance } from '@/engine/balance';
import type { Facing, MapDef } from '@/engine/types';
import { enemyContent, GAME_CONTENT } from '@/content/gameContent';

type Panel = 'bag' | 'journal' | 'help' | 'system' | null;
type CombatCommand = Exclude<CombatAction['type'], 'attack'> | 'attack';

const DIRECTIONS: Record<string, Facing> = {
  KeyW: 'N', KeyA: 'W', KeyS: 'S', KeyD: 'E',
};

const PANEL_KEYS: Record<string, Exclude<Panel, null>> = {
  KeyB: 'bag', KeyJ: 'journal', KeyH: 'help', KeyM: 'system',
};

const ITEM_LABELS: Record<string, string> = {
  최종원고: '최종 원고',
  태블릿배터리: '태블릿 배터리',
  업무폰: '업무폰',
};

const createSeed = () => ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) || 1;

export default function GameClient({ map, balance, onExitToMenu }: { map: MapDef; balance: Balance; onExitToMenu?: () => void }) {
  const stateRef = useRef<RtState>(newRt(map, balance, DEFAULT_CFG, createSeed()));
  const keysRef = useRef(new Set<string>());
  const calmClickRef = useRef(false);
  const combatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const defenseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const defenseStartedAtRef = useRef<number | null>(null);
  const defenseResolverRef = useRef<(result: DefenseResult) => void>(() => undefined);
  const combatBusyRef = useRef(false);
  const [frame, setFrame] = useState(0);
  const [manualPaused, setManualPaused] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [running, setRunning] = useState(false);
  const [combatBusy, setCombatBusy] = useState(false);
  const [targeting, setTargeting] = useState(false);
  const [defenseStartedAt, setDefenseStartedAt] = useState<number | null>(null);
  const [defenseProgress, setDefenseProgress] = useState(0);
  const paused = manualPaused || panel !== null || stateRef.current.combat !== null;

  const releaseControls = useCallback(() => {
    keysRef.current.clear();
    calmClickRef.current = false;
    setRunning(false);
  }, []);

  const openPanel = useCallback((next: Exclude<Panel, null>) => {
    if (stateRef.current.combat || stateRef.current.over) return;
    releaseControls();
    setPanel((current) => current === next ? null : next);
  }, [releaseControls]);

  const closePanel = useCallback(() => {
    releaseControls();
    setPanel(null);
  }, [releaseControls]);

  const clearDefenseWindow = useCallback(() => {
    if (defenseTimerRef.current) clearTimeout(defenseTimerRef.current);
    defenseTimerRef.current = null;
    defenseStartedAtRef.current = null;
    setDefenseStartedAt(null);
    setDefenseProgress(0);
  }, []);

  const finishCombatMotion = useCallback(() => {
    const latest = stateRef.current;
    if (latest.combat?.outcome) finishCombat(map, balance, latest, DEFAULT_CFG);
    combatBusyRef.current = false;
    combatTimerRef.current = null;
    setCombatBusy(false);
    setFrame((value) => value + 1);
  }, [balance, map]);

  const reset = useCallback(() => {
    if (combatTimerRef.current) clearTimeout(combatTimerRef.current);
    combatTimerRef.current = null;
    clearDefenseWindow();
    combatBusyRef.current = false;
    stateRef.current = newRt(map, balance, DEFAULT_CFG, createSeed());
    releaseControls();
    setManualPaused(false);
    setPanel(null);
    setCombatBusy(false);
    setTargeting(false);
    setFrame((value) => value + 1);
  }, [balance, clearDefenseWindow, map, releaseControls]);

  const resolveDefense = useCallback((result: DefenseResult) => {
    const state = stateRef.current;
    if (!state.combat?.awaitingDefense || combatBusyRef.current) return;

    clearDefenseWindow();
    state.combat = resolveCombatDefense(state.combat, result, balance.combat);
    state.player.hp = state.combat.playerHp;
    state.player.bitten = state.combat.playerBitten;
    releaseControls();
    combatBusyRef.current = true;
    setCombatBusy(true);
    setFrame((value) => value + 1);

    if (combatTimerRef.current) clearTimeout(combatTimerRef.current);
    combatTimerRef.current = setTimeout(finishCombatMotion, balance.combat.motionMs);
  }, [balance, clearDefenseWindow, finishCombatMotion, releaseControls]);

  useEffect(() => {
    defenseResolverRef.current = resolveDefense;
  }, [resolveDefense]);

  const startDefenseWindow = useCallback(() => {
    clearDefenseWindow();
    const startedAt = performance.now();
    defenseStartedAtRef.current = startedAt;
    setDefenseStartedAt(startedAt);
    setDefenseProgress(0);
    defenseTimerRef.current = setTimeout(() => {
      defenseResolverRef.current('miss');
    }, balance.combat.defenseWindowMs);
  }, [balance.combat.defenseWindowMs, clearDefenseWindow]);

  const handleCombatDefense = useCallback(() => {
    const startedAt = defenseStartedAtRef.current;
    if (startedAt === null || !stateRef.current.combat?.awaitingDefense) return;
    const progress = Math.max(0, Math.min(1, (performance.now() - startedAt) / balance.combat.defenseWindowMs));
    const result: DefenseResult = progress >= balance.combat.parryWindowStart && progress <= balance.combat.parryWindowEnd
      ? 'parry'
      : 'guard';
    resolveDefense(result);
  }, [balance.combat.defenseWindowMs, balance.combat.parryWindowEnd, balance.combat.parryWindowStart, resolveDefense]);

  const playCombatAction = useCallback((action: CombatAction) => {
    const state = stateRef.current;
    if (!state.combat || state.combat.outcome || combatBusyRef.current || manualPaused) return;
    if (action.type === 'radio' && state.decoysLeft <= 0) return;

    state.combat = resolveCombatAction(state.combat, action, balance.combat);
    state.player.hp = state.combat.playerHp;
    state.player.bitten = state.combat.playerBitten;
    releaseControls();
    setTargeting(false);
    setFrame((value) => value + 1);

    if (combatTimerRef.current) clearTimeout(combatTimerRef.current);
    combatTimerRef.current = null;

    if (state.combat.awaitingDefense) {
      combatBusyRef.current = false;
      setCombatBusy(false);
      startDefenseWindow();
      return;
    }

    clearDefenseWindow();
    combatBusyRef.current = true;
    setCombatBusy(true);
    combatTimerRef.current = setTimeout(finishCombatMotion, balance.combat.motionMs);
  }, [balance, clearDefenseWindow, finishCombatMotion, manualPaused, releaseControls, startDefenseWindow]);

  const handleCombatCommand = useCallback((command: CombatCommand) => {
    const combat = stateRef.current.combat;
    if (!combat || combat.awaitingDefense || combatBusyRef.current || manualPaused) return;
    if (command === 'attack') {
      if (!combat.restrained) setTargeting(true);
      return;
    }
    playCombatAction({ type: command });
  }, [manualPaused, playCombatAction]);

  const handleCombatTarget = useCallback((target: CombatPart) => {
    playCombatAction({ type: 'attack', target });
  }, [playCombatAction]);

  const queueCalmBreath = useCallback(() => {
    const state = stateRef.current;
    if (paused || state.over || !state.player.holdingBreath) return;
    calmClickRef.current = true;
  }, [paused]);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const combat = stateRef.current.combat;
      if (combat) {
        if (combat.awaitingDefense) {
          if (event.code === 'Space' && !event.repeat) {
            event.preventDefault();
            handleCombatDefense();
          }
          return;
        }
        if (event.code === 'Escape') {
          event.preventDefault();
          releaseControls();
          if (targeting) setTargeting(false);
          else setManualPaused((value) => !value);
          return;
        }
        if (event.code === 'KeyP' && !event.repeat) {
          event.preventDefault();
          releaseControls();
          setManualPaused((value) => !value);
          return;
        }
        if (manualPaused || combatBusyRef.current || event.repeat) return;

        if (targeting) {
          const targetKeys: Record<string, CombatPart> = { Digit1: 'head', Digit2: 'arms', Digit3: 'legs', Digit4: 'torso' };
          const target = targetKeys[event.code];
          if (target) {
            event.preventDefault();
            handleCombatTarget(target);
          }
          return;
        }

        const commandKeys: Record<string, CombatCommand> = { Digit1: 'attack', Digit2: 'shove', Digit3: 'radio', Digit4: 'flee' };
        const command = commandKeys[event.code];
        if (command) {
          event.preventDefault();
          handleCombatCommand(command);
        }
        return;
      }

      const requestedPanel = PANEL_KEYS[event.code];
      if (requestedPanel && !event.repeat) {
        event.preventDefault();
        openPanel(requestedPanel);
        return;
      }
      if (event.code === 'Escape') {
        event.preventDefault();
        if (panel) closePanel();
        else setManualPaused((value) => !value);
        return;
      }
      if (event.code === 'KeyP' && !event.repeat) {
        releaseControls();
        setManualPaused((value) => !value);
        return;
      }
      if (event.code === 'KeyR' && !event.repeat) {
        reset();
        return;
      }
      if (paused) return;
      if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
      keysRef.current.add(event.code);
    };

    const keyUp = (event: KeyboardEvent) => keysRef.current.delete(event.code);
    const blur = () => releaseControls();
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
    };
  }, [closePanel, handleCombatCommand, handleCombatDefense, handleCombatTarget, manualPaused, openPanel, panel, paused, releaseControls, reset, targeting]);

  useEffect(() => () => {
    if (combatTimerRef.current) clearTimeout(combatTimerRef.current);
    if (defenseTimerRef.current) clearTimeout(defenseTimerRef.current);
  }, []);

  useEffect(() => {
    if (defenseStartedAt === null) return;
    let animationFrame = 0;
    const updateDefenseProgress = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now - defenseStartedAt) / balance.combat.defenseWindowMs));
      setDefenseProgress(progress);
      if (progress < 1) animationFrame = requestAnimationFrame(updateDefenseProgress);
    };
    animationFrame = requestAnimationFrame(updateDefenseProgress);
    return () => cancelAnimationFrame(animationFrame);
  }, [balance.combat.defenseWindowMs, defenseStartedAt]);

  useEffect(() => {
    const scene = new URLSearchParams(window.location.search).get('scene');
    if (scene !== 'shadow' && scene !== 'editor' && scene !== 'listener') return;
    const state = stateRef.current;
    const enemy = state.zombies.find((zombie) => (
      scene === 'shadow' ? zombie.kind === 'shadow' : scene === 'listener' ? zombie.kind === 'listener' : zombie.kind === 'walker'
    ));
    if (!enemy || state.combat) return;
    enemy.tile = state.player.tile;
    enemy.from = state.player.tile;
    enemy.t = 0;
    enemy.dormant = true;
    setFrame((value) => value + 1);
  }, []);

  useEffect(() => {
    let animationFrame = 0;
    let lastTime = performance.now();
    let lastPaint = 0;
    let decoyLatch = false;
    let hideLatch = false;

    const loop = (now: number) => {
      const delta = Math.min(100, now - lastTime);
      lastTime = now;
      const state = stateRef.current;
      const keys = keysRef.current;

      if (!paused && !state.over) {
        let direction: Facing | null = null;
        for (const key of keys) if (DIRECTIONS[key]) direction = DIRECTIONS[key];

        const isRunning = keys.has('ShiftLeft') || keys.has('ShiftRight');
        const decoyPressed = keys.has('KeyQ');
        const hidePressed = keys.has('KeyC');
        const input: RtInput = {
          dir: direction,
          gait: isRunning ? 'run' : 'walk',
          act: keys.has('Space'),
          decoy: decoyPressed && !decoyLatch,
          hide: hidePressed && !hideLatch,
          calm: calmClickRef.current,
        };
        decoyLatch = decoyPressed;
        hideLatch = hidePressed;
        calmClickRef.current = false;
        stepRt(map, balance, state, input, delta, DEFAULT_CFG);
        setRunning(isRunning && direction !== null);
      }

      if (now - lastPaint > 32) {
        setFrame((value) => (value + 1) % 1000000);
        lastPaint = now;
      }
      animationFrame = requestAnimationFrame(loop);
    };

    animationFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrame);
  }, [balance, map, paused]);

  const state = stateRef.current;
  const combat = state.combat;
  const combatEnemy = combat ? enemyContent(combat.enemyKind) : null;
  const inCombat = combat !== null;
  const chasing = inCombat ? 0 : state.zombies.filter((zombie) => zombie.state === 'CHASE').length;
  const shadowVisible = state.zombies.some((zombie) => zombie.kind === 'shadow' && state.visibleIds.includes(zombie.id));
  const shadowChasing = state.zombies.some((zombie) => zombie.kind === 'shadow' && zombie.state === 'CHASE');
  const nearby = state.zombies.filter((zombie) => chebyshev(map, zombie.tile, state.player.tile) <= 2).length;
  const alert = Math.round(Math.max(0, ...state.zombies.map((zombie) => zombie.alert)));
  const hiddenThreat = state.player.hidden && state.zombies.some((zombie) => (
    !zombie.dormant && zombie.stunMs <= 0 && chebyshev(map, zombie.tile, state.player.tile) <= 1
  ));
  const breathPercent = Math.max(0, Math.min(100, (state.player.breath / DEFAULT_CFG.breathCapacity) * 100));
  const playerRow = Math.floor(state.player.tile / map.w);
  const breathHudAtTop = playerRow >= Math.floor(map.h * 0.55);
  const breathLocked = state.player.breathNeedsRelease || state.timeMs < state.player.breathLockedUntilMs;
  const showBreathHud = state.player.hidden && (
    hiddenThreat || state.player.holdingBreath || breathLocked || state.player.breath < DEFAULT_CFG.breathCapacity
  );
  const breathMessage = state.player.calmFeedback === 'success'
    ? '숨을 조금 되찾았다'
    : state.player.calmFeedback === 'gasp' || breathLocked
      ? '숨이 터졌다 · SPACE를 놓아라'
      : state.player.holdingBreath
        ? '버튼을 눌러 더 버텨라'
        : hiddenThreat
          ? 'SPACE를 눌러 숨을 참아라'
          : '호흡 회복 중';
  const acquired = new Set(state.carried);
  const canHide = canHideAt(map, state);
  const elapsed = `${Math.floor(state.timeMs / 60000).toString().padStart(2, '0')}:${Math.floor((state.timeMs % 60000) / 1000).toString().padStart(2, '0')}`;

  return (
    <main className={`game-shell ${chasing ? 'is-chased' : ''} ${shadowVisible ? 'shadow-visible' : ''} ${shadowChasing ? 'shadow-chasing' : ''} ${inCombat ? 'is-in-combat' : ''}`} data-frame={frame}>
      <header className="masthead">
        <div>
          <p className="eyebrow">마감 감염 01 · 사옥 지하 원고 보관실</p>
          <h1>컷 밖의 밤</h1>
        </div>
        <div className="header-objective">
          <span>현재 목표</span>
          <strong>{acquired.has('최종원고') ? '지하 업로드 단말기로 가라' : '손상된 최종 원고를 복구하라'}</strong>
        </div>
        <div className="night-clock" aria-label={`경과 시간 ${elapsed}`}>
          <span>경과</span>
          <strong>{elapsed}</strong>
        </div>
      </header>

      <section className="game-layout">
        <div className="scene-column">
          <div className="scene-frame">
            <div className={`scene-caption ${chasing ? 'chasing' : ''} ${inCombat ? 'combat-caption' : ''}`}>
              <span>{inCombat ? combat?.enemyKind === 'shadow' ? '버린 콘티와 미완성 선택이 앞을 막았다.' : '원고를 받기 전에는 보내줄 생각이 없다.' : shadowChasing ? '버린 콘티로 만들어진 검은 내가 지나온 길을 밟는다.' : shadowVisible ? '원고 선반 끝에서 같은 얼굴이 이쪽을 보고 있다.' : chasing ? '“작가님, 잠깐만요.” 마감에 감염된 편집팀이 달려온다.' : '꺼지지 않은 업무폰에서 수정 요청이 반복된다.'}</span>
              <div>
                {inCombat ? <b className="combat-signal">교전 중</b> : chasing > 0 && <b className="chase-signal">추격 중</b>}
                <i>{combat ? `${combatEnemy?.displayName} · ${combat.round}턴` : state.player.hidden ? state.player.holdingBreath ? '숨 참는 중 · 경계 감소' : '숨는 중 · 인접 시 경계 상승' : running ? '달리는 중 · 소음 큼' : canHide ? 'C · 원고 선반 뒤에 숨기' : '걷는 중 · 소음 낮음'}</i>
              </div>
            </div>
            <GameStage map={map} state={state} balance={balance} obscured={inCombat} />
            {showBreathHud && !inCombat && !state.over && (
              <section className={`breath-hud ${breathHudAtTop ? 'is-top' : 'is-bottom'} ${state.player.holdingBreath ? 'is-ready' : ''} ${breathLocked ? 'is-gasping' : ''}`} aria-label={`남은 숨 ${Math.round(state.player.breath)}퍼센트`}>
                <header>
                  <span>숨 참기</span>
                  <strong>{Math.ceil(state.player.breath)}<small> / {DEFAULT_CFG.breathCapacity}</small></strong>
                </header>
                <div className="breath-track" aria-hidden="true">
                  <b style={{ width: `${breathPercent}%` }} />
                </div>
                <p>{breathMessage}</p>
                {state.player.holdingBreath && (
                  <button type="button" className="is-ready" onMouseDown={(event) => event.preventDefault()} onClick={queueCalmBreath}>
                    <b>+{DEFAULT_CFG.calmRestore}</b><span>호흡 연장</span>
                  </button>
                )}
              </section>
            )}
            {combat && (
              <CombatStage
                combat={combat}
                maxHp={balance.player.hp}
                radioCount={state.decoysLeft}
                targeting={targeting}
                busy={combatBusy || manualPaused}
                defenseActive={defenseStartedAt !== null}
                defenseProgress={defenseProgress}
                defenseWindowMs={balance.combat.defenseWindowMs}
                parryWindowStart={balance.combat.parryWindowStart}
                parryWindowEnd={balance.combat.parryWindowEnd}
                onCommand={handleCombatCommand}
                onTarget={handleCombatTarget}
                onCancelTarget={() => setTargeting(false)}
                onDefend={handleCombatDefense}
              />
            )}
            {manualPaused && !panel && <div className="pause-card">{inCombat ? '전투 일시 정지' : '숨을 고르는 중'}</div>}
            {state.over && (
              <div className={`result-card ${state.over}`}>
                <p>{state.over === 'escaped' ? '최종 원고 송고 완료' : '마감에 붙잡혔다'}</p>
                <button type="button" onClick={reset}>다시 시작</button>
              </div>
            )}
          </div>

          <div className="status-strip">
            <div className="status-objective"><span>목표</span><strong>{acquired.has('최종원고') ? '원고 업로드' : '최종 원고 복구'}</strong></div>
            <div><span>상태</span><strong className={inCombat || running || state.player.hidden ? 'warn' : ''}>{combat ? `교전 ${combat.round}턴` : state.player.hidden ? state.player.holdingBreath ? '숨 참는 중' : '숨는 중' : running ? '달리기' : canHide ? '숨기 가능' : '걷기'}</strong></div>
            <div className={state.player.hidden ? 'status-stealth-alert' : ''}>
              <span>{state.player.hidden ? '은신 의심' : '위험'}</span>
              {state.player.hidden ? (
                <div className={`status-alert-meter ${state.player.holdingBreath ? 'is-calming' : hiddenThreat ? 'is-rising' : ''}`}>
                  <strong>{alert}%</strong>
                  <i aria-label={`은신 의심 ${alert}%`}><b style={{ width: `${alert}%` }} /></i>
                </div>
              ) : (
                <strong className={inCombat || chasing ? 'danger-text' : ''}>{combat ? `다음 · ${combat.intent === 'grab' ? '붙잡기' : combat.intent === 'bite' ? '물어뜯기' : '돌진'}` : chasing ? `${chasing}체 추격` : `${alert}% 경계`}</strong>
              )}
            </div>
            <div><span>{inCombat ? '거리' : '근접'}</span><strong>{combat ? (combat.distance === 'open' ? '벌어짐' : '밀착') : `${nearby}체`}</strong></div>
          </div>
        </div>

        <aside className="quick-rail" aria-label="게임 메뉴">
          <div className="rail-vitals" aria-label={`체력 ${state.player.hp}`}>
            <span>HP</span>
            <div>{Array.from({ length: balance.player.hp }, (_, index) => <i key={index} className={index < state.player.hp ? 'full' : ''} />)}</div>
          </div>
          <nav>
            <button type="button" className={panel === 'bag' ? 'active' : ''} onClick={() => openPanel('bag')} aria-label="가방 열기" disabled={inCombat || Boolean(state.over)}>
              <b>▦</b><span>가방</span><kbd>B</kbd>
            </button>
            <button type="button" className={panel === 'journal' ? 'active' : ''} onClick={() => openPanel('journal')} aria-label="기록 열기" disabled={inCombat || Boolean(state.over)}>
              <b>≡</b><span>기록</span><kbd>J</kbd>
            </button>
            <button type="button" className={panel === 'help' ? 'active' : ''} onClick={() => openPanel('help')} aria-label="조작 설명 열기" disabled={inCombat || Boolean(state.over)}>
              <b>?</b><span>조작</span><kbd>H</kbd>
            </button>
            <button type="button" className={panel === 'system' ? 'active' : ''} onClick={() => openPanel('system')} aria-label="메인 메뉴 열기" disabled={inCombat || Boolean(state.over)}>
              <b>⌂</b><span>메뉴</span><kbd>M</kbd>
            </button>
          </nav>
          <button type="button" className="rail-pause" onClick={() => { releaseControls(); setManualPaused((value) => !value); }} aria-label={manualPaused ? '게임 계속하기' : '게임 일시정지'}>
            <b>{manualPaused ? '▶' : 'Ⅱ'}</b><span>{manualPaused ? '계속' : '정지'}</span><kbd>ESC</kbd>
          </button>
        </aside>
      </section>

      {panel && (
        <div className="panel-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePanel(); }}>
          <section className={`game-panel panel-${panel}`} role="dialog" aria-modal="true" aria-labelledby="panel-title">
            <header>
              <div>
                <p className="eyebrow">게임 시간 정지</p>
                <h2 id="panel-title">{panel === 'bag' ? '야근 탈출 가방' : panel === 'journal' ? '오늘 마감의 기록' : panel === 'help' ? '마감에서 살아남는 법' : '진행 중인 회차'}</h2>
              </div>
              <button type="button" className="panel-close" onClick={closePanel} aria-label="팝업 닫기">×</button>
            </header>

            {panel === 'bag' && (
              <div className="bag-layout">
                <div className="bag-portrait"><img src={GAME_CONTENT.player.bagPortrait} alt={`가방을 확인하는 ${GAME_CONTENT.player.displayName}`} /><span>{state.over === 'dead' ? '이번 화는 여기서 끊겼다.' : state.player.bitten ? '마감 감염이 번지고 있다.' : shadowVisible ? '저건 내가 아니다.' : '아직 마감에 잠식되지 않았다.'}</span></div>
                <div className="bag-contents">
                  <div className="panel-section-title"><span>소지품</span><small>{state.carried.length} / 6</small></div>
                  <div className="inventory-grid">
                    {Array.from({ length: 6 }, (_, index) => {
                      const item = state.carried[index];
                      return <div key={index} className={item ? 'filled' : ''}>{item ? <><b>{item === '최종원고' ? '✦' : '▥'}</b><span>{ITEM_LABELS[item] ?? item}</span></> : <small>비어 있음</small>}</div>;
                    })}
                  </div>
                  <div className="quick-items">
                    <div><span>업무폰</span><strong>{state.decoysLeft}</strong></div>
                    <p><kbd>Q</kbd>로 켜두면 읽지 않은 알림이 감염된 편집팀을 유인한다.</p>
                  </div>
                </div>
              </div>
            )}

            {panel === 'journal' && (
              <div className="journal-layout">
                <section>
                  <div className="panel-section-title"><span>목표</span><small>오늘 밤</small></div>
                  <ol className="journal-objectives">
                    <li className={acquired.has('최종원고') ? 'done' : ''}><b>01</b><span>손상된 최종 원고 복구</span></li>
                    <li className={acquired.has('태블릿배터리') ? 'done' : ''}><b>02</b><span>태블릿 배터리는 선택</span></li>
                    <li><b>03</b><span>{GAME_CONTENT.enemies.shadow.displayName}를 피해 업로드 단말기에 도착</span></li>
                  </ol>
                </section>
                <section>
                  <div className="panel-section-title"><span>기록</span><small>최근 사건</small></div>
                  <div className="journal-log">
                    {state.log.length === 0 && <p>서버랙과 복합기가 꺼지지 않은 채 웅웅거린다.</p>}
                    {state.log.slice(-8).reverse().map((entry, index) => <p key={`${entry.atMs}-${index}`}><time>{(entry.atMs / 1000).toFixed(1)}s</time>{entry.msg}</p>)}
                  </div>
                </section>
              </div>
            )}

            {panel === 'help' && (
              <div className="help-layout">
                <div><kbd>WASD</kbd><strong>걷기</strong><p>낮은 소음을 내며 한 칸씩 이동한다.</p></div>
                <div><kbd>SHIFT + WASD</kbd><strong>달리기</strong><p>빠르지만 멀리 있는 편집팀까지 깨울 수 있다.</p></div>
                <div><kbd>SPACE</kbd><strong>상호작용 / 숨 참기</strong><p>은신 중 길게 누르면 경계를 낮춘다. 화면의 호흡 연장 버튼은 횟수 제한 없이 남은 숨을 조금씩 회복한다.</p></div>
                <div><kbd>C</kbd><strong>원고 선반 뒤에 숨기</strong><p>선반 바로 옆에서 숨는다. 깨어 있는 편집팀의 정면에서는 실패하며, 움직이면 즉시 해제된다.</p></div>
                <div><kbd>Q</kbd><strong>업무폰 설치</strong><p>잠시 뒤 알림을 쏟아내 감염된 편집팀을 유인한다.</p></div>
                <div><kbd>1 — 4</kbd><strong>1:1 전투</strong><p>공격·밀치기·업무폰·도주를 고른다. 공격에서는 다시 1~4로 부위를 정한다.</p></div>
              </div>
            )}

            {panel === 'system' && (
              <div className="system-menu-layout">
                <p className="system-menu-index">NIGHT 01 · IN PROGRESS</p>
                <h3>원고 보관실을 나가겠습니까?</h3>
                <p>현재 프로토타입은 진행 중인 위치를 저장하지 않는다. 메인 메뉴로 돌아오면 이번 회차가 종료된다.</p>
                <div>
                  <button type="button" onClick={closePanel}>계속 플레이</button>
                  <button type="button" className="danger" onClick={onExitToMenu}>회차 중단 · 메인 메뉴</button>
                </div>
              </div>
            )}

            <footer><span><kbd>B / J / H / M / ESC</kbd>로 닫기</span><button type="button" onClick={closePanel}>게임으로 돌아가기</button></footer>
          </section>
        </div>
      )}
    </main>
  );
}
