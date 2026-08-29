'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { GAME_CONTENT } from '@/content/gameContent';
import styles from './StoryCardLabClient.module.css';

const SWIPE_THRESHOLD = 74;
const SETTLE_TIME = 390;
const INTRO_AUTO_DELAY = 5200;
const INTRO_EXIT_TIME = 1000;

type IntroPhase = 'active' | 'leaving' | 'done';

const toneClass = {
  paper: styles.tonePaper,
  danger: styles.toneDanger,
  shadow: styles.toneShadow,
} as const;

type StoryCardLabClientProps = {
  mode?: 'lab' | 'game';
  onStartGame?: () => void;
  onExit?: () => void;
  starting?: boolean;
  reducedMotion?: boolean;
};

export default function StoryCardLabClient({
  mode = 'lab',
  onStartGame,
  onExit,
  starting = false,
  reducedMotion = false,
}: StoryCardLabClientProps) {
  const frames = GAME_CONTENT.experience.prologue;
  const episode = GAME_CONTENT.experience.episode;
  const introSummaryLines = episode.summary.match(/[^.]+(?:\.|$)/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [episode.summary];
  const isGameMode = mode === 'game';
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const [introPhase, setIntroPhase] = useState<IntroPhase>(isGameMode ? 'active' : 'done');
  const pointerRef = useRef<{ id: number; startX: number } | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introAutoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introCompletionRef = useRef(!isGameMode);
  const introSkipButtonRef = useRef<HTMLButtonElement | null>(null);
  const activeCardRef = useRef<HTMLElement | null>(null);
  const isIntroActive = isGameMode && introPhase !== 'done';

  const finishEpisodeIntro = useCallback(() => {
    if (!isGameMode || introCompletionRef.current) return;
    introCompletionRef.current = true;
    if (introAutoTimerRef.current) clearTimeout(introAutoTimerRef.current);
    if (introExitTimerRef.current) clearTimeout(introExitTimerRef.current);
    introAutoTimerRef.current = null;
    setIntroPhase('leaving');
    introExitTimerRef.current = setTimeout(() => {
      setIntroPhase('done');
      introExitTimerRef.current = null;
    }, reducedMotion ? 80 : INTRO_EXIT_TIME);
  }, [isGameMode, reducedMotion]);

  const moveTo = useCallback((nextIndex: number) => {
    if (settling || starting || nextIndex < 0 || nextIndex >= frames.length || nextIndex === currentIndex) return;

    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    setDragging(false);
    setDragX(0);
    setSettling(true);
    setCurrentIndex(nextIndex);
    settleTimerRef.current = setTimeout(() => {
      setDisplayIndex(nextIndex);
      setSettling(false);
      settleTimerRef.current = null;
    }, reducedMotion ? 30 : SETTLE_TIME);
  }, [currentIndex, frames.length, reducedMotion, settling, starting]);

  const showNext = useCallback(() => moveTo(currentIndex + 1), [currentIndex, moveTo]);
  const showPrevious = useCallback(() => moveTo(currentIndex - 1), [currentIndex, moveTo]);

  useEffect(() => {
    if (!isGameMode || introPhase !== 'active') return;
    introAutoTimerRef.current = setTimeout(finishEpisodeIntro, reducedMotion ? 3900 : INTRO_AUTO_DELAY);
    return () => {
      if (introAutoTimerRef.current) clearTimeout(introAutoTimerRef.current);
      introAutoTimerRef.current = null;
    };
  }, [finishEpisodeIntro, introPhase, isGameMode, reducedMotion]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (starting) {
        event.preventDefault();
        return;
      }
      if (event.code === 'Escape' && isGameMode && onExit) {
        event.preventDefault();
        onExit();
        return;
      }
      const target = event.target as HTMLElement | null;
      const interactive = target?.closest('button, a, input, textarea, select, [contenteditable="true"]');

      if (isIntroActive) {
        if (!event.repeat && !event.isComposing && !interactive && (event.code === 'Space' || event.code === 'Enter')) {
          event.preventDefault();
          finishEpisodeIntro();
        }
        return;
      }

      if (event.code === 'ArrowRight' || event.code === 'KeyD' || (event.code === 'Space' && !interactive)) {
        event.preventDefault();
        showNext();
      } else if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
        event.preventDefault();
        showPrevious();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [finishEpisodeIntro, isGameMode, isIntroActive, onExit, showNext, showPrevious, starting]);

  useEffect(() => () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    if (introAutoTimerRef.current) clearTimeout(introAutoTimerRef.current);
    if (introExitTimerRef.current) clearTimeout(introExitTimerRef.current);
  }, []);

  useEffect(() => {
    if (!isGameMode) return;
    if (introPhase === 'active') {
      requestAnimationFrame(() => introSkipButtonRef.current?.focus());
    } else if (introPhase === 'done') {
      requestAnimationFrame(() => activeCardRef.current?.focus());
    }
  }, [currentIndex, introPhase, isGameMode]);

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (settling || starting || (event.target as HTMLElement).closest('button')) return;
    pointerRef.current = { id: event.pointerId, startX: event.clientX };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    setDragX(0);
  };

  const updateDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!pointerRef.current || pointerRef.current.id !== event.pointerId || settling) return;
    const delta = Math.max(-180, Math.min(180, event.clientX - pointerRef.current.startX));
    setDragX(delta);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!pointerRef.current || pointerRef.current.id !== event.pointerId) return;
    const delta = event.clientX - pointerRef.current.startX;
    pointerRef.current = null;
    setDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (delta <= -SWIPE_THRESHOLD && currentIndex < frames.length - 1) {
      showNext();
    } else if (delta >= SWIPE_THRESHOLD && currentIndex > 0) {
      showPrevious();
    } else if (Math.abs(delta) < 7 && currentIndex < frames.length - 1) {
      showNext();
    } else {
      setDragX(0);
    }
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (pointerRef.current?.id !== event.pointerId) return;
    pointerRef.current = null;
    setDragging(false);
    setDragX(0);
  };

  const isLast = currentIndex === frames.length - 1;
  const dragProgress = Math.min(1, Math.abs(dragX) / SWIPE_THRESHOLD);

  return (
    <main className={`${styles.lab} ${isGameMode ? styles.gameMode : ''} ${starting ? styles.isStarting : ''} ${reducedMotion ? styles.reduceMotion : ''}`}>
      <div className={styles.paperGrid} aria-hidden="true" />

      <header className={styles.header} inert={isIntroActive ? true : undefined} aria-hidden={isIntroActive ? true : undefined}>
        {onExit ? (
          <button type="button" className={styles.backControl} onClick={onExit} disabled={starting}>← 타이틀</button>
        ) : (
          <a className={styles.backControl} href="/">← 게임으로 돌아가기</a>
        )}
        <div className={styles.identity}>
          <span>{isGameMode ? 'MAIN STORY' : 'STORY CARD LAB'}</span>
          <strong>
            {isGameMode ? `CUT ${String(currentIndex + 1).padStart(2, '0')} / ${String(frames.length).padStart(2, '0')}` : <>{episode.code}<i />{episode.title}</>}
          </strong>
        </div>
        {!isGameMode && <div className={styles.sampleBadge}>본편 미적용 샘플</div>}
      </header>

      <section className={styles.workspace} aria-label={isGameMode ? '프롤로그 카드' : '스토리 카드 방식 비교 화면'} inert={isIntroActive ? true : undefined} aria-hidden={isIntroActive ? true : undefined}>
        {!isGameMode && (
          <aside className={styles.explanation}>
            <p>PROTOTYPE 01</p>
            <h1>화면이 아니라<br />카드를 넘긴다.</h1>
            <div className={styles.rule} />
            <ul>
              <li>배경과 조작부는 고정</li>
              <li>다음 카드가 뒤에서 대기</li>
              <li>맨 앞 카드만 화면 밖으로 이동</li>
            </ul>
          </aside>
        )}

        <div className={styles.deckStage}>
          <div className={styles.deck} aria-live="off">
            {frames.map((frame, index) => {
              const offset = index - currentIndex;
              const positionClass = offset < 0
                ? styles.cardPast
                : offset === 0
                  ? styles.cardActive
                  : offset === 1
                    ? styles.cardNext
                    : styles.cardAfter;
              const isActive = offset === 0;
              const cardStyle = isActive ? {
                '--drag-x': `${dragX}px`,
                '--drag-rotate': `${dragX / 24}deg`,
              } as CSSProperties : undefined;

              return (
                <article
                  ref={isActive ? activeCardRef : undefined}
                  key={frame.cut}
                  className={`${styles.card} ${toneClass[frame.tone]} ${positionClass} ${isActive && dragging ? styles.isDragging : ''} ${isActive && isLast ? styles.isLast : ''}`}
                  style={cardStyle}
                  aria-hidden={!isActive}
                  aria-label={isActive ? `${frame.cut}, ${frame.title}. ${isLast ? '마지막 카드' : '클릭하거나 왼쪽으로 밀어 다음 카드를 봅니다.'}` : undefined}
                  role={isActive && !isLast ? 'button' : undefined}
                  tabIndex={isActive && !isLast ? 0 : -1}
                  onKeyDown={isActive && !isLast ? (event) => { if (event.key === 'Enter') showNext(); } : undefined}
                  onPointerDown={isActive ? beginDrag : undefined}
                  onPointerMove={isActive ? updateDrag : undefined}
                  onPointerUp={isActive ? finishDrag : undefined}
                  onPointerCancel={isActive ? cancelDrag : undefined}
                >
                  <div className={styles.cardTopline}>
                    <span>{frame.cut}</span>
                    <b>{frame.time}</b>
                  </div>
                  <figure className={styles.cardArt}>
                    <img src={frame.image} alt={isActive ? frame.imageAlt : ''} draggable="false" />
                    <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  </figure>
                  <div className={styles.cardCopy}>
                    <h2>{frame.title}</h2>
                    <div aria-hidden="true" />
                    <p>{frame.body}</p>
                    {isLast && (
                      <small><b>임무</b>{episode.objective}</small>
                    )}
                  </div>
                  {isActive && !isLast && <span className={styles.scribbledNext} aria-hidden="true">다음 <b>↗</b></span>}
                  {isActive && (
                    <>
                      {!isLast && <span className={styles.nextStamp} style={{ opacity: dragX < 0 ? dragProgress : 0 }}>다음 원고</span>}
                      <span className={styles.previousStamp} style={{ opacity: dragX > 0 && currentIndex > 0 ? dragProgress : 0 }}>이전 원고</span>
                    </>
                  )}
                </article>
              );
            })}
          </div>

          {!isGameMode && (
            <p className={styles.gestureHint}>
              <span aria-hidden="true">↔</span>
              카드를 클릭하거나 좌우로 밀어보세요
            </p>
          )}
        </div>

        {!isGameMode && (
          <aside className={styles.deckMap}>
            <p>원고 묶음</p>
            <ol>
              {frames.map((frame, index) => (
                <li key={frame.cut} className={index === currentIndex ? styles.isCurrent : index < currentIndex ? styles.isRead : ''}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div><b>{frame.cut}</b><small>{index < currentIndex ? '넘긴 카드' : index === currentIndex ? '맨 앞 카드' : '뒤에 대기 중'}</small></div>
                </li>
              ))}
            </ol>
            <div className={styles.differenceNote}>
              <b>달라지는 점</b>
              <p>다음 내용이 갑자기 나타나는 대신, 처음부터 뒤에 있던 카드가 앞으로 올라옵니다.</p>
            </div>
          </aside>
        )}
      </section>

      <footer className={styles.footer} inert={isIntroActive ? true : undefined} aria-hidden={isIntroActive ? true : undefined}>
        <div className={styles.status} aria-live="polite">
          <span aria-hidden="true">{String(displayIndex + 1).padStart(2, '0')}</span>
          <div aria-hidden="true">
            {frames.map((frame, index) => <i key={frame.cut} className={index <= displayIndex ? styles.isOn : ''} />)}
          </div>
          <span className={styles.srOnly}>{frames.length}개 중 {displayIndex + 1}번째 컷, {frames[displayIndex].title}</span>
          {!isGameMode && <small>← → / A D / SPACE</small>}
        </div>
        {onStartGame ? (
          <button type="button" className={styles.gameStart} onClick={onStartGame} disabled={starting || settling}><span>{starting ? '진입 중' : '게임 시작하기'}</span><b aria-hidden="true">→</b></button>
        ) : (
          <a className={styles.gameStart} href="/?start=game"><span>게임 시작하기</span><b aria-hidden="true">→</b></a>
        )}
      </footer>

      {isIntroActive && (
        <section
          className={`${styles.episodeIntro} ${introPhase === 'leaving' ? styles.introLeaving : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="episode-intro-title"
          aria-describedby="episode-intro-description"
          onClick={finishEpisodeIntro}
        >
          <div className={styles.srOnly}>
            <h1 id="episode-intro-title">{episode.code}, {episode.title}</h1>
            <p id="episode-intro-description">{episode.summary}</p>
          </div>
          <div className={styles.episodeIntroCopy} aria-hidden="true">
            <p>{episode.code}</p>
            <h1>{episode.title}</h1>
            <i />
            <strong>
              {introSummaryLines.map((sentence) => <span key={sentence}>{sentence}</span>)}
            </strong>
          </div>
          <button
            ref={introSkipButtonRef}
            type="button"
            className={styles.introSkip}
            aria-label="프롤로그 건너뛰기"
            onClick={(event) => {
              event.stopPropagation();
              finishEpisodeIntro();
            }}
          >
            SKIP
          </button>
        </section>
      )}
    </main>
  );
}
