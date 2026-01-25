'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Business {
  id: number;
  name: string;
  website: string | null;
  email: string | null;
  email_confidence: number;
  phone: string | null;
  address: string | null;
  rating: number | null;
  review_count: number | null;
  source: string;
}

interface SharedList {
  id: string;
  name: string;
  description: string | null;
  color: string;
  lead_count: number;
  view_count: number;
  download_count: number;
  created_at: string;
}

export default function SharedListPage() {
  const params = useParams();
  const shareToken = params.listId as string;

  const [list, setList] = useState<SharedList | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEmails, setShowEmails] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    async function fetchList() {
      try {
        const response = await fetch(`/api/lists?token=${shareToken}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError('This list is not available or has been made private.');
          } else {
            setError('Failed to load list.');
          }
          return;
        }

        const data = await response.json();
        setList(data.list);
        setBusinesses(data.businesses || []);
      } catch {
        setError('Failed to load list.');
      } finally {
        setIsLoading(false);
      }
    }

    fetchList();
  }, [shareToken]);

  const handleDownload = async (format: 'csv' | 'json') => {
    setIsDownloading(true);
    try {
      const response = await fetch(`/api/lists?token=${shareToken}&download=true&format=${format}`);
      if (!response.ok) throw new Error('Download failed');

      if (format === 'json') {
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `${list?.name || 'leads'}.json`);
      } else {
        const text = await response.text();
        const blob = new Blob([text], { type: 'text/csv' });
        downloadBlob(blob, `${list?.name || 'leads'}.csv`);
      }
    } catch {
      console.error('Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#64ffda] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#8892b0]">Loading shared list...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <svg className="w-16 h-16 text-[#5a5a7e] mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <h1 className="text-xl font-semibold text-white mb-2">List Not Available</h1>
          <p className="text-[#8892b0] mb-6">{error}</p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-[#64ffda] text-[#0a0a0f] font-medium rounded-lg hover:bg-[#7effea] transition-colors"
          >
            Find Your Own Leads
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <header className="border-b border-[#2a2a4e] bg-[#0a0a0f]/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 text-[#64ffda] hover:text-[#7effea] transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="text-sm font-medium">LeadGenTool</span>
            </Link>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDownload('csv')}
                disabled={isDownloading}
                className="px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4e] text-white text-sm rounded-lg hover:border-[#64ffda] transition-colors disabled:opacity-50"
              >
                Download CSV
              </button>
              <button
                onClick={() => handleDownload('json')}
                disabled={isDownloading}
                className="px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4e] text-white text-sm rounded-lg hover:border-[#64ffda] transition-colors disabled:opacity-50"
              >
                Download JSON
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* List Info */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: list?.color || '#64ffda' }}
            />
            <h1 className="text-2xl font-bold text-white">{list?.name}</h1>
          </div>
          {list?.description && (
            <p className="text-[#8892b0] mb-4">{list.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-4 text-sm text-[#5a5a7e]">
            <span>{list?.lead_count || businesses.length} leads</span>
            <span>{list?.view_count} views</span>
            <span>{list?.download_count} downloads</span>
            <span>Shared {list?.created_at ? new Date(list.created_at).toLocaleDateString() : ''}</span>
          </div>
        </div>

        {/* Email Toggle */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showEmails}
                onChange={(e) => setShowEmails(e.target.checked)}
                className="w-4 h-4 accent-[#64ffda]"
              />
              <span className="text-sm text-[#8892b0]">Show email addresses</span>
            </label>
          </div>
        </div>

        {/* Leads Table */}
        <div className="bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2a2a4e]">
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#8892b0]">Business</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#8892b0]">Contact</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#8892b0]">Location</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#8892b0]">Rating</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((business) => (
                  <tr key={business.id} className="border-b border-[#2a2a4e] hover:bg-[#0a0a0f]/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{business.name}</div>
                      {business.website && (
                        <a
                          href={business.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[#64ffda] hover:underline"
                        >
                          {new URL(business.website).hostname}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {showEmails && business.email ? (
                        <div className="flex items-center gap-2">
                          <a
                            href={`mailto:${business.email}`}
                            className="text-sm text-[#64ffda] hover:underline"
                          >
                            {business.email}
                          </a>
                          {business.email_confidence >= 0.8 && (
                            <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                              Verified
                            </span>
                          )}
                        </div>
                      ) : business.email ? (
                        <span className="text-sm text-[#5a5a7e]">Email available</span>
                      ) : (
                        <span className="text-sm text-[#5a5a7e]">-</span>
                      )}
                      {business.phone && (
                        <div className="text-sm text-[#8892b0] mt-1">{business.phone}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-[#8892b0] max-w-xs truncate">
                        {business.address || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {business.rating ? (
                        <div className="flex items-center gap-1">
                          <svg className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          <span className="text-white text-sm">{business.rating.toFixed(1)}</span>
                          {business.review_count && (
                            <span className="text-[#5a5a7e] text-xs">({business.review_count})</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-[#5a5a7e]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {businesses.length === 0 && (
            <div className="text-center py-12 text-[#5a5a7e]">
              No leads in this list yet.
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="mt-12 text-center bg-gradient-to-r from-[#1a1a2e] to-[#0a0a0f] border border-[#2a2a4e] rounded-xl p-8">
          <h2 className="text-xl font-semibold text-white mb-2">
            Create Your Own Lead Lists
          </h2>
          <p className="text-[#8892b0] mb-6 max-w-md mx-auto">
            Find and organize business leads with verified emails, ratings, and more.
          </p>
          <Link
            href="/"
            className="inline-block px-8 py-3 bg-[#64ffda] text-[#0a0a0f] font-medium rounded-lg hover:bg-[#7effea] transition-colors"
          >
            Start Finding Leads
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#2a2a4e] py-6 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-[#5a5a7e]">
          Powered by <Link href="/" className="text-[#64ffda] hover:underline">LeadGenTool</Link>
        </div>
      </footer>
    </div>
  );
}
