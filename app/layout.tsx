import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '컷 밖의 밤',
  description: '최종 원고를 들고 마감에 감염된 편집팀에게서 도망치는 실시간 격자 생존 호러',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
