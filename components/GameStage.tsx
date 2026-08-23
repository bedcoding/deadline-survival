import { canHideAt, lerpPos, visibleZombies } from '@/engine/rt';
import { chebyshev, xy } from '@/engine/geom';
import type { RtState } from '@/engine/rt';
import type { Balance } from '@/engine/balance';
import type { Facing, MapDef } from '@/engine/types';
import { enemyContent, GAME_CONTENT } from '@/content/gameContent';

const ROTATION: Record<Facing, number> = { N: 180, E: -90, S: 0, W: 90 };

export default function GameStage({ map, state, balance, obscured = false }: { map: MapDef; state: RtState; balance: Balance; obscured?: boolean }) {
  const player = lerpPos(map, state.player);
  const visible = visibleZombies(state);
  const danger = new Set(state.danger);
  const canHide = canHideAt(map, state);
  const hiddenThreat = state.player.hidden && state.zombies.some((zombie) => (
    !zombie.dormant && zombie.stunMs <= 0 && chebyshev(map, zombie.tile, state.player.tile) <= 1
  ));

  const position = (x: number, y: number) => ({
    left: `${((x + 0.5) / map.w) * 100}%`,
    top: `${((y + 0.5) / map.h) * 100}%`,
  });

  return (
    <div className={`game-stage ${obscured ? 'is-obscured' : ''}`} style={{ '--map-w': map.w, '--map-h': map.h } as React.CSSProperties}>
      <div className="floor-texture" />
      <div className="tile-grid">
        {map.kind.map((kind, tile) => {
          const seen = state.seen[tile] ?? 0;
          return (
            <div
              key={tile}
              className={`map-tile tile-${kind} seen-${seen} ${danger.has(tile) && seen === 2 ? 'in-danger' : ''} ${tile === map.exit ? 'is-exit' : ''}`}
            >
              {kind === 'shelf' && <span className="shelf-goods" />}
              {kind === 'door' && <span className={state.openDoors.includes(tile) ? 'door-open' : 'door-closed'} />}
              {kind === 'glass' && <span className="glass-shards">◇</span>}
              {tile === map.exit && <span className="exit-mark">업로드</span>}
            </div>
          );
        })}
      </div>

      {state.noises.map((noise, index) => {
        const tile = xy(map, noise.tile);
        const age = Math.min(1, (state.timeMs - noise.atMs) / 1600);
        return (
          <i
            key={`${noise.atMs}-${index}`}
            className={`noise-ring ${noise.src}`}
            style={{ ...position(tile.x, tile.y), '--noise-age': age, '--noise-size': noise.value } as React.CSSProperties}
          />
        );
      })}

      {state.zombies.map((zombie) => {
        if (!visible.has(zombie.id)) return null;
        const point = lerpPos(map, zombie);
        const content = enemyContent(zombie.kind);
        return (
          <div
            key={zombie.id}
            className={`actor zombie kind-${zombie.kind} ${zombie.dormant ? 'dormant' : ''} state-${zombie.state.toLowerCase()}`}
            style={position(point.x, point.y)}
          >
            <div className="actor-shadow" />
            <img
              src={content.fieldSprite}
              alt={content.alt}
            />
            {zombie.kind === 'shadow' && <i className="ink-echo" aria-hidden="true" />}
            {!zombie.dormant && zombie.alert > 3 && (
              <span className={`awareness-ring ${zombie.state === 'CHASE' ? 'is-chasing' : ''}`} style={{ '--alert': zombie.alert } as React.CSSProperties}>
                <b>{zombie.state === 'CHASE' ? '!' : zombie.alert >= 45 ? '!' : '?'}</b>
              </span>
            )}
            {zombie.state === 'CHASE' && <span className="chase-tag">{content.chaseLabel}</span>}
            {zombie.dormant && <span className="sleep-mark">…</span>}
          </div>
        );
      })}

      {!state.player.hidden && <div className="flashlight-cone" style={{ ...position(player.x, player.y), transform: `translate(-50%, -50%) rotate(${ROTATION[state.player.facing]}deg)` }} />}
      <div className={`actor player ${state.player.hidden ? 'is-hidden' : ''} ${state.player.hurtUntilMs > state.timeMs ? 'is-hurt' : ''}`} style={position(player.x, player.y)}>
        <div className="actor-shadow" />
        <img src={GAME_CONTENT.player.fieldSprites[state.player.facing]} alt={GAME_CONTENT.player.displayName} />
        {state.player.hidden && (
          <span className={`hidden-tag ${hiddenThreat ? 'is-threat' : ''} ${state.player.holdingBreath ? 'is-holding' : ''}`}>
            {hiddenThreat
              ? state.player.holdingBreath
                ? '숨 참는 중'
                : <><kbd>SPACE</kbd> 숨 참기</>
              : '숨는 중'}
          </span>
        )}
        {!state.player.hidden && canHide && <span className="hide-prompt"><kbd>C</kbd> 숨기</span>}
      </div>

      <div className="scene-vignette" />
      <div className="map-legend"><span>시야 {balance.player.sight}</span><span>업로드 단말기를 찾아라</span></div>
    </div>
  );
}
