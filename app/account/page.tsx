'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface UserStats {
  savedLeadsCount: number;
  leadListsCount: number;
  savedSearchesCount: number;
  totalSearchesRun: number;
}

export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/account');
    }
  }, [status, router]);

  useEffect(() => {
    async function loadStats() {
      if (!session?.user) return;

      try {
        const response = await fetch('/api/user/stats');
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Failed to load stats:', error);
      } finally {
        setIsLoading(false);
      }
    }

    if (session?.user) {
      loadStats();
    }
  }, [session]);

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[#8892b0]">Loading...</div>
      </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' });
  };

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="text-[#64ffda] hover:underline text-sm">
            &larr; Back to Search
          </Link>
          <h1 className="text-2xl font-bold text-white">Account Settings</h1>
          <div className="w-20" />
        </div>

        {/* Profile Card */}
        <div className="bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg p-6 mb-6">
          <div className="flex items-center gap-4">
            {session.user.image ? (
              <img
                src={session.user.image}
                alt={session.user.name || 'Profile'}
                className="w-16 h-16 rounded-full"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[#64ffda]/20 flex items-center justify-center">
                <span className="text-2xl text-[#64ffda]">
                  {(session.user.name || session.user.email || 'U')[0].toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <h2 className="text-xl font-semibold text-white">
                {session.user.name || 'Lead Generator User'}
              </h2>
              <p className="text-[#8892b0]">{session.user.email}</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-[#64ffda]">{stats.savedLeadsCount}</div>
              <div className="text-sm text-[#8892b0]">Saved Leads</div>
            </div>
            <div className="bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-white">{stats.leadListsCount}</div>
              <div className="text-sm text-[#8892b0]">Lead Lists</div>
            </div>
            <div className="bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-white">{stats.savedSearchesCount}</div>
              <div className="text-sm text-[#8892b0]">Saved Searches</div>
            </div>
            <div className="bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-white">{stats.totalSearchesRun}</div>
              <div className="text-sm text-[#8892b0]">Searches Run</div>
            </div>
          </div>
        )}

        {/* Quick Links */}
        <div className="bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg overflow-hidden mb-6">
          <h3 className="text-lg font-semibold text-white p-4 border-b border-[#2a2a4e]">
            Your Data
          </h3>
          <Link
            href="/account/saved-leads"
            className="flex items-center justify-between p-4 hover:bg-[#2a2a4e] transition-colors border-b border-[#2a2a4e]"
          >
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-[#64ffda]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <span className="text-white">Saved Leads</span>
            </div>
            <svg className="w-5 h-5 text-[#8892b0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/account/lists"
            className="flex items-center justify-between p-4 hover:bg-[#2a2a4e] transition-colors border-b border-[#2a2a4e]"
          >
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-[#64ffda]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span className="text-white">Lead Lists</span>
            </div>
            <svg className="w-5 h-5 text-[#8892b0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/account/searches"
            className="flex items-center justify-between p-4 hover:bg-[#2a2a4e] transition-colors"
          >
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-[#64ffda]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="text-white">Saved Searches</span>
            </div>
            <svg className="w-5 h-5 text-[#8892b0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* Sign Out */}
        <button
          onClick={handleSignOut}
          className="w-full py-3 bg-transparent border border-[#2a2a4e] text-[#8892b0] rounded-lg hover:border-red-500/50 hover:text-red-400 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
