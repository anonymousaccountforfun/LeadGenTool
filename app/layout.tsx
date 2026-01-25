import type { Metadata } from 'next';
import './globals.css';
import { SessionProvider } from '@/components/session-provider';

export const metadata: Metadata = {
  title: 'Lead Generator',
  description: 'Find B2C business leads across the US',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0a0f]">
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
