import type { CSSProperties } from 'react';

export type EncounterTransitionPhase = 'covering' | 'revealing';

type EncounterTransitionProps = {
  phase: EncounterTransitionPhase;
  enemyName: string;
  originX: number;
  originY: number;
};

const PIECES = ['north-west', 'north-east', 'middle-west', 'middle-east', 'south-west', 'south-east'] as const;

export default function EncounterTransition({ phase, enemyName, originX, originY }: EncounterTransitionProps) {
  return (
    <div
      className={`encounter-transition is-${phase}`}
      style={{
        '--encounter-x': `${originX}%`,
        '--encounter-y': `${originY}%`,
      } as CSSProperties}
      aria-hidden="true"
    >
      <span className="encounter-ink-veil" />
      {PIECES.map((piece) => (
        <i key={piece} className={`encounter-paper piece-${piece}`}><b /></i>
      ))}
      <span className="encounter-impact-mark"><i /></span>
      <span className="encounter-cut-label"><small>ENCOUNTER</small><strong>{enemyName}</strong></span>
    </div>
  );
}
