import type { Metadata } from 'next';
import FxLabClient from '@/components/FxLabClient';

export const metadata: Metadata = {
  title: '전투 연출 실험실 | 컷 밖의 밤',
  description: '전투 공격과 피격 연출을 같은 조건에서 비교하는 개발용 화면',
};

export default function FxLabPage() {
  return <FxLabClient />;
}
