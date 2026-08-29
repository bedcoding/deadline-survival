'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import GameClient from './GameClient';
import StoryCardLabClient from './StoryCardLabClient';
import { GAME_CONTENT } from '@/content/gameContent';
import type { Balance } from '@/engine/balance';
import type { MapDef } from '@/engine/types';

type Screen = 'menu' | 'story' | 'game';
type MenuDialog = null | 'archive' | 'settings';

export default function ExperienceClient({ map, balance }: { map: MapDef; balance: Balance }) {
  const content = GAME_CONTENT.experience;
  const [screen, setScreen] = useState<Screen>('menu');
  const [dialog, setDialog] = useState<MenuDialog>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [launching, setLaunching] = useState(false);
  const launchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newGameButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const savedMotion = window.localStorage.getItem('cut-outside-night:reduced-motion');
    if (savedMotion === 'true') setReducedMotion(true);

    const params = new URLSearchParams(window.location.search);
    const scene = params.get('scene');
    if (params.get('start') === 'game' || scene === 'shadow' || scene === 'editor' || scene === 'listener') setScreen('game');
  }, []);

  const updateMotion = () => {
    setReducedMotion((current) => {
      const next = !current;
      window.localStorage.setItem('cut-outside-night:reduced-motion', String(next));
      return next;
    });
  };

  const beginStory = () => {
    setLaunching(false);
    setDialog(null);
    setScreen('story');
  };

  const launchGame = useCallback(() => {
    if (launching) return;
    if (launchTimerRef.current) clearTimeout(launchTimerRef.current);
    setDialog(null);
    setLaunching(true);
    launchTimerRef.current = setTimeout(() => {
      launchTimerRef.current = null;
      setLaunching(false);
      setScreen('game');
    }, reducedMotion ? 30 : 420);
  }, [launching, reducedMotion]);

  const returnToMenu = () => {
    if (launchTimerRef.current) clearTimeout(launchTimerRef.current);
    launchTimerRef.current = null;
    setLaunching(false);
    setDialog(null);
    setScreen('menu');
    requestAnimationFrame(() => newGameButtonRef.current?.focus());
  };

  useEffect(() => () => {
    if (launchTimerRef.current) clearTimeout(launchTimerRef.current);
  }, []);

  if (screen === 'game') {
    return (
      <div className={`experience-root ${reducedMotion ? 'reduce-motion' : ''}`}>
        <GameClient map={map} balance={balance} reducedMotion={reducedMotion} onExitToMenu={returnToMenu} />
      </div>
    );
  }

  if (screen === 'story') {
    return (
      <StoryCardLabClient
        mode="game"
        onStartGame={launchGame}
        onExit={returnToMenu}
        starting={launching}
        reducedMotion={reducedMotion}
      />
    );
  }

  return (
    <main className={`experience-root title-screen ${reducedMotion ? 'reduce-motion' : ''}`}>
      <div className="title-paper-grid" aria-hidden="true" />
      <header className="title-topline">
        <span>{content.edition}</span>
        <div><i /> NIGHT 01 <i /></div>
      </header>

      <section className="title-layout">
        <div className="title-visual" aria-hidden="true">
          <div className="title-redaction redaction-a" />
          <div className="title-redaction redaction-b" />
          <img className="title-shadow-character" src={GAME_CONTENT.enemies.shadow.fieldSprite} alt="" />
          <img className="title-main-character" src={GAME_CONTENT.player.titleSprite} alt="" />
          <span className="editor-note">수정 요청<br />확인 필요</span>
        </div>

        <div className="title-copy">
          <p className="title-kicker">{content.subtitle}</p>
          <h1>{content.title}</h1>
          <p className="title-tagline">{content.tagline}</p>

          <nav className="main-menu" aria-label="메인 메뉴">
            <button ref={newGameButtonRef} type="button" className="primary" onClick={beginStory}><b>01</b><span><strong>새 회차 시작</strong><small>{content.episode.title}</small></span><i>→</i></button>
            <button type="button" disabled><b>02</b><span><strong>이어하기</strong><small>저장된 진행 기록 없음</small></span><i>×</i></button>
            <button type="button" onClick={() => setDialog('archive')}><b>03</b><span><strong>기록 보관함</strong><small>회차와 완성된 컷 확인</small></span><i>→</i></button>
            <button type="button" onClick={() => setDialog('settings')}><b>04</b><span><strong>설정</strong><small>연출과 화면 동작</small></span><i>→</i></button>
          </nav>

        </div>
      </section>

      <footer className="title-footer">
        <span>{content.episode.code}</span>
        <p>{content.episode.location}</p>
        <b>WEB SURVIVAL PROTOTYPE</b>
      </footer>

      {dialog && (
        <div className="menu-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
          <section className="menu-dialog" role="dialog" aria-modal="true" aria-labelledby="menu-dialog-title">
            <header><span>{dialog === 'archive' ? 'ARCHIVE' : 'SETTINGS'}</span><button type="button" onClick={() => setDialog(null)} aria-label="닫기">×</button></header>
            {dialog === 'archive' ? (
              <div className="archive-empty">
                <b>00</b>
                <h2 id="menu-dialog-title">아직 보관된 회차가 없다.</h2>
                <p>첫 번째 원고를 송고하면 플레이 기록과 만들어진 컷이 이곳에 남는다.</p>
                <button type="button" className="ink-button" onClick={beginStory}><span>첫 회차 시작</span><b>→</b></button>
              </div>
            ) : (
              <div className="settings-list">
                <div><span><b id="menu-dialog-title">화면 움직임</b><small>추격과 경고 연출의 흔들림을 조절한다.</small></span><button type="button" onClick={updateMotion}>{reducedMotion ? '절제' : '기본'}</button></div>
                <div className="setting-disabled"><span><b>효과음</b><small>사운드 추가 후 활성화된다.</small></span><button type="button" disabled>준비 중</button></div>
                <p>조작키는 게임 안의 <kbd>H</kbd> 메뉴에서 언제든 확인할 수 있다.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
