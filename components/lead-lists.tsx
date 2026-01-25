'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { ShareListModal } from './share-list-modal';

interface LeadList {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_public: boolean;
  share_token: string | null;
  view_count: number;
  download_count: number;
  lead_count: number;
  created_at: string;
  updated_at: string;
}

interface LeadListsProps {
  onSelectList?: (listId: string) => void;
}

export function LeadLists({ onSelectList }: LeadListsProps) {
  const { data: session } = useSession();
  const [lists, setLists] = useState<LeadList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [shareList, setShareList] = useState<LeadList | null>(null);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [newListColor, setNewListColor] = useState('#64ffda');

  const colors = ['#64ffda', '#f472b6', '#818cf8', '#fb923c', '#4ade80', '#f87171'];

  useEffect(() => {
    if (session?.user) {
      loadLists();
    } else {
      setIsLoading(false);
    }
  }, [session]);

  const loadLists = async () => {
    try {
      const response = await fetch('/api/lists');
      if (response.ok) {
        const data = await response.json();
        setLists(data.lists || []);
      }
    } catch (error) {
      console.error('Failed to load lists:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateList = async () => {
    if (!newListName.trim()) return;

    try {
      const response = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newListName.trim(),
          description: newListDescription.trim() || null,
          color: newListColor,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setLists([data.list, ...lists]);
        setShowCreateModal(false);
        setNewListName('');
        setNewListDescription('');
        setNewListColor('#64ffda');
      }
    } catch (error) {
      console.error('Failed to create list:', error);
    }
  };

  const handleDeleteList = async (listId: string) => {
    if (!confirm('Are you sure you want to delete this list?')) return;

    try {
      const response = await fetch(`/api/lists?id=${listId}`, { method: 'DELETE' });
      if (response.ok) {
        setLists(lists.filter(l => l.id !== listId));
      }
    } catch (error) {
      console.error('Failed to delete list:', error);
    }
  };

  const handleShareUpdate = (listId: string, isPublic: boolean, shareToken: string | null) => {
    setLists(lists.map(l =>
      l.id === listId ? { ...l, is_public: isPublic, share_token: shareToken } : l
    ));
  };

  if (!session?.user) {
    return (
      <div className="bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg p-6 text-center">
        <svg className="w-12 h-12 text-[#5a5a7e] mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <h3 className="text-white font-medium mb-2">Sign in to create lists</h3>
        <p className="text-sm text-[#8892b0] mb-4">
          Organize your leads into lists and share them with your team.
        </p>
        <a
          href="/login"
          className="inline-block px-4 py-2 bg-[#64ffda] text-[#0a0a0f] font-medium text-sm rounded-lg hover:bg-[#7effea] transition-colors"
        >
          Sign In
        </a>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center py-8 text-[#8892b0]">
        Loading lists...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-[#64ffda]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          Lead Lists
        </h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-3 py-1.5 bg-[#64ffda] text-[#0a0a0f] text-sm font-medium rounded-lg hover:bg-[#7effea] transition-colors"
        >
          + New List
        </button>
      </div>

      {/* Lists */}
      {lists.length === 0 ? (
        <div className="bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg p-6 text-center">
          <p className="text-[#8892b0] mb-4">No lists yet. Create one to organize your leads.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-[#64ffda] text-[#0a0a0f] font-medium text-sm rounded-lg hover:bg-[#7effea] transition-colors"
          >
            Create Your First List
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {lists.map(list => (
            <div
              key={list.id}
              className="bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg p-4 hover:border-[#3a3a5e] transition-colors group"
            >
              <div className="flex items-center justify-between">
                <button
                  onClick={() => onSelectList?.(list.id)}
                  className="flex-1 text-left flex items-center gap-3"
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: list.color }}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{list.name}</span>
                      {list.is_public && (
                        <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                          Public
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#5a5a7e] mt-0.5">
                      {list.lead_count} leads
                      {list.is_public && ` • ${list.view_count} views • ${list.download_count} downloads`}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setShareList(list)}
                    className="p-2 text-[#8892b0] hover:text-[#64ffda] hover:bg-[#64ffda]/10 rounded-lg transition-colors"
                    title="Share"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDeleteList(list.id)}
                    className="p-2 text-[#8892b0] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a2e] border border-[#2a2a4e] rounded-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[#2a2a4e]">
              <h2 className="text-lg font-semibold text-white">Create New List</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-[#8892b0] hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-[#8892b0] mb-1">Name</label>
                <input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="My Lead List"
                  className="w-full px-3 py-2 bg-[#0a0a0f] border border-[#2a2a4e] rounded-lg text-white placeholder-[#5a5a7e] focus:outline-none focus:border-[#64ffda]"
                />
              </div>

              <div>
                <label className="block text-sm text-[#8892b0] mb-1">Description (optional)</label>
                <textarea
                  value={newListDescription}
                  onChange={(e) => setNewListDescription(e.target.value)}
                  placeholder="What's this list for?"
                  rows={2}
                  className="w-full px-3 py-2 bg-[#0a0a0f] border border-[#2a2a4e] rounded-lg text-white placeholder-[#5a5a7e] focus:outline-none focus:border-[#64ffda] resize-none"
                />
              </div>

              <div>
                <label className="block text-sm text-[#8892b0] mb-2">Color</label>
                <div className="flex items-center gap-2">
                  {colors.map(color => (
                    <button
                      key={color}
                      onClick={() => setNewListColor(color)}
                      className={`w-8 h-8 rounded-full transition-transform ${
                        newListColor === color ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#1a1a2e]' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-[#2a2a4e] flex justify-end gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-[#8892b0] text-sm hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateList}
                disabled={!newListName.trim()}
                className="px-4 py-2 bg-[#64ffda] text-[#0a0a0f] font-medium text-sm rounded-lg hover:bg-[#7effea] transition-colors disabled:opacity-50"
              >
                Create List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {shareList && (
        <ShareListModal
          listId={shareList.id}
          listName={shareList.name}
          isPublic={shareList.is_public}
          shareToken={shareList.share_token}
          onClose={() => setShareList(null)}
          onUpdate={(isPublic, shareToken) => handleShareUpdate(shareList.id, isPublic, shareToken)}
        />
      )}
    </div>
  );
}
