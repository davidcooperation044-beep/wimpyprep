import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'WimpyPrep',
  description: 'JAMB and WAEC exam prep with practice, mock exams, and AI insights.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
