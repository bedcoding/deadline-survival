import type { Facing, ZombieKind } from '@/engine/types';

type EnemyContent = {
  displayName: string;
  fieldSprite: string;
  combatSprite: string;
  alt: string;
  chaseLabel: string;
};

type GameContent = {
  experience: {
    title: string;
    subtitle: string;
    edition: string;
    tagline: string;
    episode: {
      code: string;
      title: string;
      location: string;
      summary: string;
      objective: string;
      warning: string;
    };
    prologue: readonly {
      cut: string;
      time: string;
      title: string;
      body: string;
      image: string;
      imageAlt: string;
      tone: 'paper' | 'danger' | 'shadow';
    }[];
  };
  player: {
    displayName: string;
    fieldSprites: Record<Facing, string>;
    titleSprite: string;
    briefingArtwork: string;
    combatSprite: string;
    bagPortrait: string;
  };
  enemies: Record<ZombieKind, EnemyContent>;
};

/**
 * 프로젝트 고유 캐릭터명과 이미지의 유일한 진입점.
 * 엔진은 이 파일을 import하지 않으며 player / ZombieKind만 다룬다.
 */
export const GAME_CONTENT = {
  experience: {
    title: '컷 밖의 밤',
    subtitle: '야근 전염병 생존 기록',
    edition: 'DEADLINE ARCHIVE',
    tagline: '완성하지 못한 컷은\n밤이 되면 작가를 찾아온다.',
    episode: {
      code: 'EPISODE 01',
      title: '손상된 최종 원고',
      location: '사옥 지하 원고 보관실',
      summary: '송고 직전 깨진 원고의 마지막 백업은 지하 보관실에 있다. 원고를 복구하고 업로드 단말기까지 살아서 이동해야 한다.',
      objective: '최종 원고를 복구하고 지하 단말기에서 송고하라.',
      warning: '야근에 잠식된 편집팀과 버려진 콘티의 그림자가 보관실을 배회한다.',
    },
    prologue: [
      {
        cut: 'CUT 01',
        time: '마감 00:27',
        title: '마지막 저장 파일이 열리지 않았다.',
        body: '꺼지지 않는 업무폰에는 같은 수정 요청만 쌓여 갔다. 오늘 밤 원고를 보내지 못하면 모든 컷이 사라진다.',
        image: '/assets/player-thinking.png',
        imageAlt: '손상된 원고를 확인하는 주인공',
        tone: 'paper',
      },
      {
        cut: 'CUT 02',
        time: '마감 00:19',
        title: '야근 전염병이 편집팀을 좀비로 만들었다.',
        body: '그들은 더는 퇴근하지도, 원고를 포기하지도 못한다. 복도 너머에서는 “작가님, 잠깐만요”라는 목소리만 반복됐다.',
        image: '/assets/editor-zombie-toon-v1.png',
        imageAlt: '원고를 움켜쥔 마감 감염 편집자',
        tone: 'danger',
      },
      {
        cut: 'CUT 03',
        time: '마감 00:11',
        title: '지하에는 내가 버린 장면도 남아 있었다.',
        body: '백업 원고가 있는 보관실 끝에서 같은 얼굴이 돌아봤다. 보내지 못한 콘티와 미완성 선택이 검은 형체가 되어 기다리고 있었다.',
        image: '/assets/shadow-double.png',
        imageAlt: '어둠 속에서 모습을 드러낸 검은 분신',
        tone: 'shadow',
      },
    ],
  },
  player: {
    displayName: '주인공',
    fieldSprites: {
      N: '/assets/player-back-clean.png',
      E: '/assets/player-right-clean.png',
      S: '/assets/player-front.png',
      W: '/assets/player-left.png',
    },
    titleSprite: '/assets/player-right-clean.png',
    briefingArtwork: '/assets/player-right-clean.png',
    combatSprite: '/assets/player-back-clean.png',
    bagPortrait: '/assets/player-thinking.png',
  },
  enemies: {
    walker: {
      displayName: '마감에 감염된 편집자',
      fieldSprite: '/assets/editor-zombie-toon-v1.png',
      combatSprite: '/assets/editor-zombie-toon-v1.png',
      alt: '원고를 든 채 배회하는 마감 감염 편집자',
      chaseLabel: '마감 추적',
    },
    listener: {
      displayName: '알림에 예민한 편집자',
      fieldSprite: '/assets/editor-listener-toon-v1.png',
      combatSprite: '/assets/editor-listener-toon-v1.png',
      alt: '업무 알림 소리를 뒤쫓는 편집자',
      chaseLabel: '알림 추적',
    },
    shadow: {
      displayName: '검은 분신',
      fieldSprite: '/assets/shadow-double.png',
      combatSprite: '/assets/shadow-double.png',
      alt: '버린 콘티에서 생겨난 검은 분신',
      chaseLabel: '기억 중',
    },
  },
} as const satisfies GameContent;

export function enemyContent(kind: ZombieKind): EnemyContent {
  return GAME_CONTENT.enemies[kind];
}
