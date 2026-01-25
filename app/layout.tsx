import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Lead Generator', description: 'Find leads for any business' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="min-h-screen bg-[#0a0a0f]">{children}</body></html>;
}
