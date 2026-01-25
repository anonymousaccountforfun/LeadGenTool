'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface SavedSearch {
  id: string;
  name: string;
  query: string;
  location: string | null;
  filters: Record<string, unknown>;
  created_at: string;
  last_run: string | null;
}

interface SavedSearchesListProps {
  onRunSearch: (search: SavedSearch) => void;
  maxItems?: number;
}

export function SavedSearchesList({ onRunSearch, maxItems = 5 }: SavedSearchesListProps) {
  const { data: session } = useSession();
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSearches() {
      setIsLoading(true);

      try {
        if (session?.user) {
          // Load from API for logged-in users
          const response = await fetch('/api/user/searches');
          if (response.ok) {
            const data = await response.json();
            setSearches(data.searches || []);
          }
        } else {
          // Load from localStorage for anonymous users
          const savedSearches = JSON.parse(localStorage.getItem('savedSearches') || '[]');
          setSearches(savedSearches);
        }
      } catch (error) {
        console.error('Failed to load searches:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadSearches();
  }, [session]);

  const handleDelete = async (searchId: string) => {
    try {
      if (session?.user) {
        // Delete from API
        await fetch(`/api/user/searches?id=${searchId}`, { method: 'DELETE' });
      } else {
        // Delete from localStorage
        const savedSearches = JSON.parse(localStorage.getItem('savedSearches') || '[]');
        const updated = savedSearches.filter((s: SavedSearch) => s.id !== searchId);
        localStorage.setItem('savedSearches', JSON.stringify(updated));
      }
      setSearches(prev => prev.filter(s => s.id !== searchId));
    } catch (error) {
      console.error('Failed to delete search:', error);
    }
  };

  const handleRun = async (search: SavedSearch) => {
    // Update last_run
    if (session?.user) {
      try {
        await fetch('/api/user/searches', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ searchId: search.id, action: 'run' }),
        });
      } catch (error) {
        console.error('Failed to update last run:', error);
      }
    }
    onRunSearch(search);
  };

  if (isLoading) {
    return (
      <div className="text-center py-4 text-[#8892b0] text-sm">
        Loading saved searches...
      </div>
    );
  }

  if (searches.length === 0) {
    return null;
  }

  const displayedSearches = searches.slice(0, maxItems);

  return (
    <div className="w-full max-w-2xl mx-auto mt-8">
      <h3 className="text-sm font-medium text-[#8892b0] mb-3 flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
        Saved Searches
      </h3>
      <div className="space-y-2">
        {displayedSearches.map((search) => (
          <div
            key={search.id}
            className="flex items-center justify-between p-3 bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg group hover:border-[#3a3a5e] transition-colors"
          >
            <button
              onClick={() => handleRun(search)}
              className="flex-1 text-left touch-manipulation"
            >
              <div className="flex items-center gap-2">
                <span className="text-white text-sm font-medium truncate">
                  {search.name}
                </span>
                {search.last_run && (
                  <span className="text-xs text-[#5a5a7e]">
                    Last run {new Date(search.last_run).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="text-xs text-[#8892b0] mt-0.5">
                {search.query}
                {search.location && ` in ${search.location}`}
              </div>
            </button>
            <div className="flex items-center gap-2 ml-2">
              <button
                onClick={() => handleRun(search)}
                className="p-2 text-[#64ffda] hover:bg-[#64ffda]/10 rounded-lg transition-colors touch-manipulation"
                title="Run search"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <button
                onClick={() => handleDelete(search.id)}
                className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 touch-manipulation"
                title="Delete search"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
      {searches.length > maxItems && (
        <p className="text-center text-xs text-[#5a5a7e] mt-2">
          +{searches.length - maxItems} more saved searches
        </p>
      )}
    </div>
  );
}
