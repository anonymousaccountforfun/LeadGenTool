'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';

interface SaveSearchButtonProps {
  query: string;
  location?: string;
  filters?: Record<string, unknown>;
  onSaved?: () => void;
}

export function SaveSearchButton({ query, location, filters, onSaved }: SaveSearchButtonProps) {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(`${query}${location ? ` in ${location}` : ''}`);
  const [isLoading, setIsLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Also support localStorage for anonymous users
  const saveToLocalStorage = () => {
    const savedSearches = JSON.parse(localStorage.getItem('savedSearches') || '[]');
    const newSearch = {
      id: `local_${Date.now()}`,
      name,
      query,
      location,
      filters,
      created_at: new Date().toISOString(),
    };
    savedSearches.unshift(newSearch);
    // Keep only last 20 searches
    if (savedSearches.length > 20) {
      savedSearches.pop();
    }
    localStorage.setItem('savedSearches', JSON.stringify(savedSearches));
    return newSearch;
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Please enter a name for this search');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      if (session?.user) {
        // Save to database for logged-in users
        const response = await fetch('/api/user/searches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, query, location, filters }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to save search');
        }
      } else {
        // Save to localStorage for anonymous users
        saveToLocalStorage();
      }

      setSaved(true);
      setIsOpen(false);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save search');
    } finally {
      setIsLoading(false);
    }
  };

  if (saved) {
    return (
      <div className="flex items-center gap-2 text-green-400 text-sm">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span>Search saved!</span>
      </div>
    );
  }

  return (
    <div className="relative">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-4 py-2 min-h-[40px] bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg text-[#8892b0] text-sm hover:border-[#64ffda] hover:text-[#64ffda] transition-colors touch-manipulation"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          Save Search
        </button>
      ) : (
        <div className="bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg p-4 min-w-[280px]">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-white">Save this search</h4>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-500 hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Search name"
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-[#2a2a4e] rounded-lg text-white text-sm placeholder-[#5a5a7e] focus:outline-none focus:border-[#64ffda] mb-3"
            disabled={isLoading}
          />

          {error && (
            <p className="text-red-400 text-xs mb-3">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setIsOpen(false)}
              disabled={isLoading}
              className="flex-1 py-2 text-sm text-[#8892b0] hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="flex-1 py-2 bg-[#64ffda] text-[#0a0a0f] text-sm font-medium rounded-lg hover:bg-[#7effea] disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>

          {!session?.user && (
            <p className="mt-3 text-xs text-[#5a5a7e]">
              Sign in to sync searches across devices
            </p>
          )}
        </div>
      )}
    </div>
  );
}
