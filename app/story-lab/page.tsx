import type { Metadata } from 'next';
import StoryCardLabClient from '@/components/StoryCardLabClient';

export const metadata: Metadata = {
  title: '스토리 카드 실험실 | 컷 밖의 밤',
  description: '겹쳐진 원고 카드를 직접 넘겨 보는 프롤로그 인터랙션 샘플',
};

export default function StoryLabPage() {
  return <StoryCardLabClient />;
}
