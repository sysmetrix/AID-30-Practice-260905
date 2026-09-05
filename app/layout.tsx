import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '런치핏',
  description: '남은 시간과 예산, 포만감, 오후 일정을 반영한 직장인 점심 추천',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
