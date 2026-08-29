'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { GAME_CONTENT } from '@/content/gameContent';
import styles from './FxLabClient.module.css';

type ActionId = 'playerHit' | 'enemyHit' | 'guard' | 'parry';
type TargetId = 'head' | 'torso';
type SpeedId = 0.5 | 1 | 1.5;
type GuardStyleId = 'brace' | 'contact' | 'deflect' | 'freeze';

const GUARD_STYLES: readonly {
  id: GuardStyleId;
  number: string;
  name: string;
  summary: string;
  badge?: string;
}[] = [
  {
    id: 'brace',
    number: '01',
    name: '묵직하게 버티기',
    summary: '몸이 크게 밀리면서 공격 궤도를 위로 흘리는 반동형',
    badge: '채택',
  },
  {
    id: 'contact',
    number: '02',
    name: '접점 차단',
    summary: '공격이 멈춘 한 점과 짧은 방어선만 보여주는 절제형',
  },
  {
    id: 'deflect',
    number: '03',
    name: '충격 흘리기',
    summary: '공격 궤적을 위로 비틀면서 관성에 밀려 크게 후퇴하는 동작형',
  },
  {
    id: 'freeze',
    number: '04',
    name: '컷 정지',
    summary: '충돌 순간 배경을 죽이고 한 프레임을 강하게 고정하는 만화형',
  },
] as const;

const GUARD_STYLE_CLASS: Record<GuardStyleId, string> = {
  brace: styles.guardStyleBrace,
  contact: styles.guardStyleContact,
  deflect: styles.guardStyleDeflect,
  freeze: styles.guardStyleFreeze,
};

const ACTION_CLASS: Record<ActionId, string> = {
  playerHit: styles.actionPlayerHit,
  enemyHit: styles.actionEnemyHit,
  guard: styles.actionGuard,
  parry: styles.actionParry,
};

const ACTION_LABEL: Record<ActionId, string> = {
  playerHit: '주인공 공격',
  enemyHit: '적 공격',
  guard: '방어',
  parry: '패링',
};

function joinClasses(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export default function FxLabClient() {
  const [action, setAction] = useState<ActionId>('playerHit');
  const [guardStyle, setGuardStyle] = useState<GuardStyleId>('brace');
  const [target, setTarget] = useState<TargetId>('head');
  const [speed, setSpeed] = useState<SpeedId>(1);
  const [autoReplay, setAutoReplay] = useState(false);
  const [playId, setPlayId] = useState(0);

  const selectedGuard = GUARD_STYLES.find((item) => item.id === guardStyle) ?? GUARD_STYLES[0];
  const previewNumber = action === 'guard' ? selectedGuard.number : '02';
  const previewName = action === 'guard' ? selectedGuard.name : '피격자 강조';
  const previewSummary = action === 'guard'
    ? selectedGuard.summary
    : '맞는 캐릭터의 반동과 명암을 연출의 중심으로 사용';

  const replay = () => setPlayId((current) => current + 1);
  const chooseGuardStyle = (nextStyle: GuardStyleId) => {
    setGuardStyle(nextStyle);
    setAction('guard');
    setPlayId((current) => current + 1);
  };
  const chooseAction = (nextAction: ActionId) => {
    setAction(nextAction);
    setPlayId((current) => current + 1);
  };
  const chooseTarget = (nextTarget: TargetId) => {
    setTarget(nextTarget);
    setPlayId((current) => current + 1);
  };

  useEffect(() => {
    if (!autoReplay) return;
    const timer = window.setInterval(replay, 1700 / speed);
    return () => window.clearInterval(timer);
  }, [autoReplay, speed]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const targetElement = event.target as HTMLElement | null;
      if (targetElement?.matches('input, textarea, select, [contenteditable="true"]')) return;

      if (event.code === 'Space') {
        event.preventDefault();
        replay();
        return;
      }

      const guardStyleByCode: Partial<Record<string, GuardStyleId>> = {
        Digit1: 'brace',
        Digit2: 'contact',
        Digit3: 'deflect',
        Digit4: 'freeze',
      };
      const actionByCode: Partial<Record<string, ActionId>> = {
        KeyA: 'playerHit',
        KeyE: 'enemyHit',
        KeyG: 'guard',
        KeyP: 'parry',
      };
      const nextGuardStyle = guardStyleByCode[event.code];
      const nextAction = actionByCode[event.code];
      if (nextGuardStyle) chooseGuardStyle(nextGuardStyle);
      if (nextAction) chooseAction(nextAction);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const durationMs = 760 / speed;
  const stageStyle = {
    '--fx-duration': `${durationMs}ms`,
    '--impact-y': action === 'parry' || action === 'guard' ? '48%' : target === 'head' ? '35%' : '59%',
  } as CSSProperties;

  const playerIsAttacker = action === 'playerHit';
  const enemyIsAttacker = action === 'enemyHit';
  const isReactionAction = action === 'guard' || action === 'parry';

  return (
    <main className={styles.root}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>개발용 전투 연출 비교 화면</p>
            <h1>전투 이펙트 실험실</h1>
            <p className={styles.intro}>같은 캐릭터와 같은 타격 위치에서 연출만 바꿔 비교합니다.</p>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.devOnly}>로컬 테스트</span>
            <Link className={styles.backLink} href="/">게임으로 돌아가기</Link>
          </div>
        </header>

        <div className={styles.workspace}>
          <section className={styles.previewColumn} aria-label="전투 이펙트 미리보기">
            <div className={styles.previewHeader}>
              <div>
                <span className={styles.previewNumber}>{previewNumber}</span>
                <div>
                  <strong>{previewName}</strong>
                  <p>{previewSummary}</p>
                </div>
              </div>
              <span className={styles.actionReadout}>{ACTION_LABEL[action]}</span>
            </div>

            <div
              key={`${guardStyle}-${action}-${target}-${playId}`}
              className={joinClasses(
                styles.stage,
                styles.variantFocus,
                ACTION_CLASS[action],
                action === 'guard' && GUARD_STYLE_CLASS[guardStyle],
                target === 'head' ? styles.targetHead : styles.targetTorso,
              )}
              style={stageStyle}
            >
              <div className={styles.gridBackdrop} />
              <div className={styles.floorGlow} />
              <div className={styles.focusShade} />
              <div className={styles.panelCut} />
              <div className={styles.speedLines} />

              <div
                className={joinClasses(
                  styles.actor,
                  styles.player,
                  playerIsAttacker && styles.attacker,
                  enemyIsAttacker && styles.victim,
                  action === 'guard' && styles.guardPlayer,
                  action === 'parry' && styles.parryPlayer,
                )}
              >
                <img className={styles.echoImage} src={GAME_CONTENT.player.combatSprite} alt="" />
                <img className={styles.echoImageTwo} src={GAME_CONTENT.player.combatSprite} alt="" />
                <img src={GAME_CONTENT.player.combatSprite} alt={`적과 마주 선 ${GAME_CONTENT.player.displayName}의 뒷모습`} />
                <span>{GAME_CONTENT.player.displayName}</span>
              </div>

              <div
                className={joinClasses(
                  styles.actor,
                  styles.enemy,
                  enemyIsAttacker && styles.attacker,
                  playerIsAttacker && styles.victim,
                  action === 'guard' && styles.guardEnemy,
                  action === 'parry' && styles.parryEnemy,
                )}
              >
                <img className={styles.echoImage} src={GAME_CONTENT.enemies.shadow.combatSprite} alt="" />
                <img className={styles.echoImageTwo} src={GAME_CONTENT.enemies.shadow.combatSprite} alt="" />
                <img src={GAME_CONTENT.enemies.shadow.combatSprite} alt={GAME_CONTENT.enemies.shadow.alt} />
                <span>{GAME_CONTENT.enemies.shadow.displayName}</span>
              </div>

              <div className={styles.inkBurst} />
              <div className={styles.attackTrail} />
              <div className={styles.impactRing} />
              <div className={styles.impactCore} />
              <div className={styles.guardArc} />
              <div className={styles.guardPlane} />
              <div className={styles.guardRipple} />
              <div className={styles.guardSlash} />
              <div className={styles.parryCross} />
              <div className={styles.screenFlash} />

              <div className={styles.stageLegend}>
                <span>{action === 'guard' ? '피해 경감' : action === 'parry' ? '반격 성공' : target === 'head' ? '머리 타격' : '몸통 타격'}</span>
                <span>{speed}배속</span>
              </div>
            </div>

            <div className={styles.transport}>
              <button type="button" className={styles.replayButton} onClick={replay}>
                <kbd>Space</kbd>
                다시 보기
              </button>
              <label className={styles.autoToggle}>
                <input
                  type="checkbox"
                  checked={autoReplay}
                  onChange={(event) => setAutoReplay(event.target.checked)}
                />
                <span aria-hidden="true" />
                자동 반복
              </label>
              <p aria-live="polite">{previewName} 재생 {playId + 1}회</p>
            </div>
          </section>

          <aside className={styles.controls} aria-label="이펙트 설정">
            <section className={styles.controlSection}>
              <div className={styles.sectionTitle}>
                <span>기본 타격 연출</span>
                <small>고정</small>
              </div>
              <div className={styles.lockedStyle}>
                <span className={styles.styleNumber}>02</span>
                <span>
                  <strong>피격자 강조</strong>
                  <small>공격과 피격, 패링은 맞는 캐릭터의 반동을 중심으로 통일</small>
                </span>
                <em>적용</em>
              </div>
            </section>

            <section className={styles.controlSection}>
              <div className={styles.sectionTitle}>
                <span>방어 모션 선택</span>
                <small>숫자 1에서 4</small>
              </div>
              <div className={styles.styleButtons}>
                {GUARD_STYLES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={joinClasses(styles.styleButton, item.id === guardStyle && styles.selected)}
                    onClick={() => chooseGuardStyle(item.id)}
                    aria-pressed={item.id === guardStyle}
                  >
                    <span className={styles.styleNumber}>{item.number}</span>
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.summary}</small>
                    </span>
                    {item.badge && <em>{item.badge}</em>}
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.controlSection}>
              <div className={styles.sectionTitle}>
                <span>동작 선택</span>
                <small>A, E, G, P</small>
              </div>
              <div className={styles.segmented}>
                {([
                  ['playerHit', '주인공 공격'],
                  ['enemyHit', '적 공격'],
                  ['guard', '방어'],
                  ['parry', '패링'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => chooseAction(id)}
                    className={action === id ? styles.selected : undefined}
                    aria-pressed={action === id}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            <div className={styles.controlGrid}>
              <section className={styles.controlSection}>
                <div className={styles.sectionTitle}><span>타격 위치</span></div>
                <div className={styles.segmented}>
                  <button
                    type="button"
                    onClick={() => chooseTarget('head')}
                    className={target === 'head' ? styles.selected : undefined}
                    aria-pressed={target === 'head'}
                    disabled={isReactionAction}
                  >머리</button>
                  <button
                    type="button"
                    onClick={() => chooseTarget('torso')}
                    className={target === 'torso' ? styles.selected : undefined}
                    aria-pressed={target === 'torso'}
                    disabled={isReactionAction}
                  >몸통</button>
                </div>
              </section>

              <section className={styles.controlSection}>
                <div className={styles.sectionTitle}><span>재생 속도</span></div>
                <div className={styles.segmented}>
                  {([0.5, 1, 1.5] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setSpeed(value);
                        replay();
                      }}
                      className={speed === value ? styles.selected : undefined}
                      aria-pressed={speed === value}
                    >{value}배</button>
                  ))}
                </div>
              </section>
            </div>

            <section className={styles.readingGuide}>
              <span>볼 지점</span>
              {action === 'guard' ? (
                <ul>
                  <li>공격이 어느 지점에서 막혔는가</li>
                  <li>방어한 주인공의 무게가 느껴지는가</li>
                  <li>빛보다 자세와 반동이 먼저 보이는가</li>
                </ul>
              ) : (
                <ul>
                  <li>공격자가 먼저 보이는가</li>
                  <li>피격자가 즉시 눈에 들어오는가</li>
                  <li>이펙트가 캐릭터보다 튀지 않는가</li>
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
