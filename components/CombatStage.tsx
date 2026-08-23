import { canFlee, INTENT_COPY, PART_LABELS } from '@/engine/combat';
import type { CombatAction, CombatPart, CombatState } from '@/engine/combat';
import { enemyContent, GAME_CONTENT } from '@/content/gameContent';

type CombatCommand = Exclude<CombatAction['type'], 'attack'> | 'attack';
const PART_KEYS: Record<CombatPart, string> = { head: '1', arms: '2', legs: '3', torso: '4' };
export default function CombatStage({
  combat,
  maxHp,
  radioCount,
  targeting,
  busy,
  defenseActive,
  defenseProgress,
  defenseWindowMs,
  parryWindowStart,
  parryWindowEnd,
  onCommand,
  onTarget,
  onCancelTarget,
  onDefend,
}: {
  combat: CombatState;
  maxHp: number;
  radioCount: number;
  targeting: boolean;
  busy: boolean;
  defenseActive: boolean;
  defenseProgress: number;
  defenseWindowMs: number;
  parryWindowStart: number;
  parryWindowEnd: number;
  onCommand: (command: CombatCommand) => void;
  onTarget: (target: CombatPart) => void;
  onCancelTarget: () => void;
  onDefend: () => void;
}) {
  const intent = INTENT_COPY[combat.intent];
  const fleeReady = canFlee(combat);
  const locked = busy || combat.awaitingDefense || combat.outcome !== null;
  const motion = `motion-${combat.lastMotion}${combat.enemyResponded ? ' enemy-responded' : ''}`;
  const enemy = enemyContent(combat.enemyKind);
  const defensePercent = Math.max(0, Math.min(100, defenseProgress * 100));
  const parryStartPercent = parryWindowStart * 100;
  const parryWidthPercent = (parryWindowEnd - parryWindowStart) * 100;
  const inParryWindow = defenseProgress >= parryWindowStart && defenseProgress <= parryWindowEnd;

  const targetButton = (part: CombatPart, detail: string) => (
    <button
      type="button"
      className={`body-target target-${part}`}
      onClick={() => onTarget(part)}
      disabled={locked}
      aria-label={`${PART_LABELS[part]} 공격: ${detail}`}
    >
      <kbd>{PART_KEYS[part]}</kbd>
      <b>{PART_LABELS[part]}</b>
      <span>{detail}</span>
    </button>
  );

  return (
    <section
      className={`combat-stage enemy-kind-${combat.enemyKind} ${motion} ${targeting ? 'is-targeting' : ''} ${combat.awaitingDefense ? 'is-awaiting-defense' : ''} ${combat.lastDefense ? `defense-${combat.lastDefense}` : ''}`}
      style={{ '--defense-window': `${defenseWindowMs}ms` } as React.CSSProperties}
      aria-label={`${enemy.displayName}과의 전투`}
    >
      <div className="combat-backdrop" aria-hidden="true">
        <i className="aisle aisle-left" />
        <i className="aisle aisle-right" />
        <i className="fluorescent-light" />
      </div>

      <header className="combat-header">
        <div className="enemy-card">
          <p>{combat.enemyKind === 'shadow' ? 'DELETED CUT' : 'ENCOUNTER'} · ROUND {combat.round.toString().padStart(2, '0')}</p>
          <div>
            <h2>{enemy.displayName}</h2>
            <span>{combat.armsBroken ? '팔 손상' : '팔 정상'} · {combat.legsBroken ? '다리 손상' : '다리 정상'}</span>
          </div>
          <div className="enemy-durability" aria-label={`적 체력 ${combat.enemyHp}/${combat.enemyMaxHp}`}>
            <i style={{ '--value': `${(combat.enemyHp / combat.enemyMaxHp) * 100}%` } as React.CSSProperties}><b>HP</b><span /></i>
            <strong>{combat.enemyHp} / {combat.enemyMaxHp}</strong>
          </div>
        </div>
        <div className={`intent-card intent-${combat.intent} ${combat.awaitingDefense ? 'is-imminent' : ''}`}>
          <span>{combat.awaitingDefense ? '공격 개시' : '다음 행동'}</span>
          <strong>{intent.label}</strong>
          <p>{intent.detail}</p>
        </div>
      </header>

      <div className="battle-exchange" key={combat.actionSerial}>
        <div className="combat-cut" aria-hidden="true" />
        <figure className="combat-figure survivor-figure">
          <img src={GAME_CONTENT.player.combatSprite} alt={`${enemy.displayName}과 마주 선 ${GAME_CONTENT.player.displayName}의 뒷모습`} />
          <figcaption>
            <span>{GAME_CONTENT.player.displayName}</span>
            <b>{combat.restrained ? '붙잡힘' : combat.distance === 'open' ? '거리 확보' : '맞붙음'}</b>
          </figcaption>
        </figure>

        <figure className="combat-figure enemy-figure">
          <div className="enemy-glow" aria-hidden="true" />
          <img src={enemy.combatSprite} alt={enemy.alt} />
          {targeting && (
            <div className="body-target-layer" aria-label="공격 부위 선택">
              {targetButton('head', '피해 3')}
              {targetButton('arms', combat.armsBroken ? '손상됨 · 피해 1' : '피해 1 · 붙잡기 봉쇄')}
              {targetButton('torso', '피해 2')}
              {targetButton('legs', combat.legsBroken ? '손상됨 · 피해 1' : '피해 1 · 도주 확보')}
            </div>
          )}
        </figure>

        <div className="impact-flash" aria-hidden="true" />
      </div>

      <footer className="combat-hud">
        <div className="combat-readout" aria-live="polite">
          <div className="combat-player-state">
            <span>HP</span>
            <div>{Array.from({ length: maxHp }, (_, index) => <i key={index} className={index < combat.playerHp ? 'full' : ''} />)}</div>
            {combat.playerBitten && <b>물림</b>}
          </div>
          <div className="combat-events">
            {combat.events.slice(-2).map((event, index) => (
              <p key={`${combat.actionSerial}-${index}`} className={`tone-${event.tone}`}><span>{event.side === 'enemy' ? '적' : event.side === 'player' ? '나' : '·'}</span>{event.text}</p>
            ))}
          </div>
        </div>

        {combat.awaitingDefense ? (
          <div className={`combat-defense-panel ${inParryWindow ? 'is-perfect' : ''}`}>
            <div className="defense-copy">
              <span>REACTION</span>
              <strong>{inParryWindow ? '지금, 받아쳐라' : '공격을 읽어라'}</strong>
              <p>바깥 구간은 방어 · 중앙의 노란 구간은 패링과 반격</p>
            </div>
            <div
              className="defense-timing"
              role="progressbar"
              aria-label="적 공격 타이밍"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(defensePercent)}
            >
              <i className="parry-zone" style={{ left: `${parryStartPercent}%`, width: `${parryWidthPercent}%` }} />
              <b className="defense-needle" style={{ left: `${defensePercent}%` }} />
            </div>
            <button type="button" onClick={onDefend} disabled={!defenseActive || busy}>
              <kbd>SPACE</kbd>
              <span>{inParryWindow ? '패링' : '방어'}</span>
            </button>
          </div>
        ) : targeting ? (
          <div className="target-command-panel">
            <div><span>공격 부위</span><strong>효과는 확정이다</strong></div>
            <p>모든 공격이 공용 HP를 깎고, 팔·다리는 적 행동까지 봉쇄한다.</p>
            <button type="button" onClick={onCancelTarget} disabled={locked}><kbd>ESC</kbd> 취소</button>
          </div>
        ) : (
          <div className="combat-command-grid" aria-label="전투 행동">
            <button type="button" onClick={() => onCommand('attack')} disabled={locked || combat.restrained}>
              <kbd>1</kbd><b>공격</b><span>{combat.restrained ? '붙잡혀 있음' : '부위를 선택한다'}</span>
            </button>
            <button type="button" onClick={() => onCommand('shove')} disabled={locked}>
              <kbd>2</kbd><b>밀치기</b><span>{combat.restrained ? '손아귀를 푼다' : '도주할 틈을 만든다'}</span>
            </button>
            <button type="button" onClick={() => onCommand('radio')} disabled={locked || radioCount <= 0}>
              <kbd>3</kbd><b>업무폰</b><span>{radioCount > 0 ? `알림으로 이탈 · ${radioCount}개` : '남은 업무폰 없음'}</span>
            </button>
            <button type="button" className={fleeReady ? 'is-ready' : ''} onClick={() => onCommand('flee')} disabled={locked || combat.restrained}>
              <kbd>4</kbd><b>도주</b><span>{combat.restrained ? '움직일 수 없다' : fleeReady ? '지금은 빠져나갈 수 있다' : '먼저 틈을 만들어야 한다'}</span>
            </button>
          </div>
        )}
      </footer>

      {combat.outcome && (
        <div className={`combat-verdict verdict-${combat.outcome}`}>
          <span>{combat.outcome === 'won' ? 'SURVIVED' : combat.outcome === 'fled' ? 'ESCAPED' : 'DEAD END'}</span>
          <strong>{combat.outcome === 'won' ? combat.enemyKind === 'shadow' ? '검은 콘티를 찢어냈다' : '잠시 업무에서 해방됐다' : combat.outcome === 'fled' ? '독촉을 따돌렸다' : '마감에 붙잡혔다'}</strong>
        </div>
      )}
    </section>
  );
}
