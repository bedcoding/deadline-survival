'use client';

import { useEffect, useState } from 'react';
import GameClient from './GameClient';
import { GAME_CONTENT } from '@/content/gameContent';
import type { Balance } from '@/engine/balance';
import type { MapDef } from '@/engine/types';

type Screen = 'menu' | 'prologue' | 'briefing' | 'game';
type MenuDialog = null | 'archive' | 'settings';

const CONTROL_NOTES = [
  ['WASD', '걷기'],
  ['SHIFT', '달리면 소음 증가'],
  ['C', '선반 뒤에 숨기'],
  ['SPACE', '상호작용 또는 숨 참기'],
] as const;

export default function ExperienceClient({ map, balance }: { map: MapDef; balance: Balance }) {
  const content = GAME_CONTENT.experience;
  const [screen, setScreen] = useState<Screen>('menu');
  const [dialog, setDialog] = useState<MenuDialog>(null);
  const [prologueIndex, setPrologueIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const savedMotion = window.localStorage.getItem('cut-outside-night:reduced-motion');
    if (savedMotion === 'true') setReducedMotion(true);

    const scene = new URLSearchParams(window.location.search).get('scene');
    if (scene === 'shadow' || scene === 'editor' || scene === 'listener') setScreen('game');
  }, []);

  const updateMotion = () => {
    setReducedMotion((current) => {
      const next = !current;
      window.localStorage.setItem('cut-outside-night:reduced-motion', String(next));
      return next;
    });
  };

  const beginPrologue = () => {
    setPrologueIndex(0);
    setDialog(null);
    setScreen('prologue');
  };

  const skipPrologue = () => {
    setDialog(null);
    setScreen('briefing');
  };

  const returnToMenu = () => {
    setDialog(null);
    setScreen('menu');
  };

  if (screen === 'game') {
    return (
      <div className={`experience-root ${reducedMotion ? 'reduce-motion' : ''}`}>
        <GameClient map={map} balance={balance} onExitToMenu={returnToMenu} />
      </div>
    );
  }

  if (screen === 'prologue') {
    const frame = content.prologue[prologueIndex]!;
    const isLast = prologueIndex === content.prologue.length - 1;
    return (
      <main className={`experience-root narrative-screen tone-${frame.tone} ${reducedMotion ? 'reduce-motion' : ''}`}>
        <header className="narrative-header">
          <button type="button" className="narrative-back" onClick={returnToMenu}>← 메인 메뉴</button>
          <div className="story-identity" aria-label={`${content.episode.code} 메인 스토리`}>
            <span>MAIN STORY</span>
            <strong><small>{content.episode.code}</small><em>{content.episode.title}</em></strong>
          </div>
          <div className="narrative-actions">
            <b aria-label={`${content.prologue.length}개 중 ${prologueIndex + 1}번째 컷`}>{String(prologueIndex + 1).padStart(2, '0')} / {String(content.prologue.length).padStart(2, '0')}</b>
          </div>
        </header>

        <section className="prologue-spread" key={frame.cut}>
          <div className="prologue-copy">
            <p className="story-scene-meta"><span>{frame.cut}</span>{frame.time}</p>
            <h1>{frame.title}</h1>
            <div className="correction-line" aria-hidden="true" />
            <p className="prologue-body">{frame.body}</p>
          </div>
          <figure className="prologue-art">
            <div className="panel-number" aria-hidden="true">{String(prologueIndex + 1).padStart(2, '0')}</div>
            <img src={frame.image} alt={frame.imageAlt} />
            <figcaption>{prologueIndex === 0 ? '파일을 복구하려면 지하로 내려가야 한다.' : prologueIndex === 1 ? '들키기 전에 원고 선반 사이를 통과하라.' : '완성하지 못한 장면은 스스로 사라지지 않는다.'}</figcaption>
          </figure>
        </section>

        <footer className="narrative-footer">
          <div className="story-progress-wrap">
            <div className="story-progress" aria-label={`프롤로그 ${prologueIndex + 1}번째 컷`}>
              {content.prologue.map((item, index) => <i key={item.cut} className={index <= prologueIndex ? 'active' : ''} />)}
            </div>
          </div>
          <div className="story-footer-actions">
            {prologueIndex > 0 && <button type="button" className="text-button" onClick={() => setPrologueIndex((index) => index - 1)}>이전 컷</button>}
            {!isLast && <button type="button" className="footer-skip-button" onClick={skipPrologue}>스토리 건너뛰기</button>}
            <button type="button" className="ink-button" onClick={() => isLast ? setScreen('briefing') : setPrologueIndex((index) => index + 1)}>
              <span>{isLast ? '임무 브리핑' : '다음 컷'}</span><b>→</b>
            </button>
          </div>
        </footer>
      </main>
    );
  }

  if (screen === 'briefing') {
    return (
      <main className={`experience-root briefing-screen ${reducedMotion ? 'reduce-motion' : ''}`}>
        <header className="narrative-header">
          <button type="button" onClick={() => setScreen('prologue')}>← 프롤로그</button>
          <span>{content.edition}</span>
          <b>MISSION BRIEF</b>
        </header>

        <section className="briefing-layout">
          <article className="briefing-paper">
            <p className="briefing-code"><span>{content.episode.code}</span><span>NIGHT SHIFT</span></p>
            <h1>{content.episode.title}</h1>
            <p className="briefing-location">⌖ {content.episode.location}</p>
            <p className="briefing-summary">{content.episode.summary}</p>
            <div className="mission-stamp">반드시<br />송고</div>
            <dl>
              <div><dt>주요 목표</dt><dd>{content.episode.objective}</dd></div>
              <div><dt>현장 경고</dt><dd>{content.episode.warning}</dd></div>
            </dl>
          </article>

          <aside className="briefing-side">
            <div className="briefing-character">
              <img src={GAME_CONTENT.player.briefingArtwork} alt={`${GAME_CONTENT.player.displayName} 임무 브리핑 이미지`} />
              <span>PLAYABLE</span>
              <strong>{GAME_CONTENT.player.displayName}</strong>
            </div>
            <div className="briefing-controls">
              <p>현장 조작</p>
              {CONTROL_NOTES.map(([key, label]) => <div key={key}><kbd>{key}</kbd><span>{label}</span></div>)}
            </div>
          </aside>
        </section>

        <footer className="briefing-footer">
          <p>필드에 들어가면 실시간으로 움직인다. 메뉴를 열면 시간이 멈춘다.</p>
          <button type="button" className="ink-button" onClick={() => setScreen('game')}><span>보관실 진입</span><b>→</b></button>
        </footer>
      </main>
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
            <button type="button" className="primary" onClick={beginPrologue}><b>01</b><span><strong>새 회차 시작</strong><small>{content.episode.title}</small></span><i>→</i></button>
            <button type="button" disabled><b>02</b><span><strong>이어하기</strong><small>저장된 진행 기록 없음</small></span><i>×</i></button>
            <button type="button" onClick={() => setDialog('archive')}><b>03</b><span><strong>기록 보관함</strong><small>회차와 완성된 컷 확인</small></span><i>→</i></button>
            <button type="button" onClick={() => setDialog('settings')}><b>04</b><span><strong>설정</strong><small>연출과 화면 동작</small></span><i>→</i></button>
          </nav>

          <button type="button" className="skip-prologue" onClick={skipPrologue}>프롤로그 건너뛰기</button>
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
                <button type="button" className="ink-button" onClick={beginPrologue}><span>첫 회차 시작</span><b>→</b></button>
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
