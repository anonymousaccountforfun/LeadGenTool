'use client';

import { useState } from 'react';

interface ShareListModalProps {
  listId: string;
  listName: string;
  isPublic: boolean;
  shareToken: string | null;
  onClose: () => void;
  onUpdate: (isPublic: boolean, shareToken: string | null) => void;
}

export function ShareListModal({
  listId,
  listName,
  isPublic: initialIsPublic,
  shareToken: initialShareToken,
  onClose,
  onUpdate,
}: ShareListModalProps) {
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [shareToken, setShareToken] = useState(initialShareToken);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = shareToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/lists/${shareToken}`
    : null;

  const handleTogglePublic = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/lists', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listId,
          action: 'set_public',
          isPublic: !isPublic,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setIsPublic(!isPublic);
        setShareToken(data.shareToken);
        onUpdate(!isPublic, data.shareToken);
      }
    } catch (error) {
      console.error('Failed to toggle visibility:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateToken = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/lists', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listId,
          action: 'regenerate_token',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setShareToken(data.shareToken);
        onUpdate(isPublic, data.shareToken);
      }
    } catch (error) {
      console.error('Failed to regenerate token:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a2e] border border-[#2a2a4e] rounded-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#2a2a4e]">
          <h2 className="text-lg font-semibold text-white">Share List</h2>
          <button
            onClick={onClose}
            className="text-[#8892b0] hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* List Name */}
          <div>
            <p className="text-sm text-[#8892b0] mb-1">Sharing</p>
            <p className="text-white font-medium">{listName}</p>
          </div>

          {/* Visibility Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">Public Access</p>
              <p className="text-sm text-[#8892b0]">
                {isPublic ? 'Anyone with the link can view' : 'Only you can access'}
              </p>
            </div>
            <button
              onClick={handleTogglePublic}
              disabled={isLoading}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                isPublic ? 'bg-[#64ffda]' : 'bg-[#2a2a4e]'
              } ${isLoading ? 'opacity-50' : ''}`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  isPublic ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Share Link */}
          {isPublic && shareUrl && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-[#8892b0] mb-2">Share Link</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 px-3 py-2 bg-[#0a0a0f] border border-[#2a2a4e] rounded-lg text-white text-sm"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="px-4 py-2 bg-[#64ffda] text-[#0a0a0f] font-medium text-sm rounded-lg hover:bg-[#7effea] transition-colors"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Regenerate Token */}
              <button
                onClick={handleRegenerateToken}
                disabled={isLoading}
                className="text-sm text-[#64ffda] hover:underline disabled:opacity-50"
              >
                Generate new link (invalidates old link)
              </button>

              {/* Embed Widget Info */}
              <div className="p-3 bg-[#0a0a0f] border border-[#2a2a4e] rounded-lg">
                <p className="text-sm text-[#8892b0] mb-2">Embed on your website:</p>
                <code className="block text-xs text-[#64ffda] break-all">
                  {`<iframe src="${shareUrl}" width="100%" height="500" frameborder="0"></iframe>`}
                </code>
              </div>
            </div>
          )}

          {/* Info */}
          {!isPublic && (
            <div className="p-3 bg-[#0a0a0f] border border-[#2a2a4e] rounded-lg">
              <p className="text-sm text-[#8892b0]">
                Enable public access to get a shareable link. Viewers can see business names,
                contact info, and download the list.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#2a2a4e] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#2a2a4e] text-white text-sm rounded-lg hover:bg-[#3a3a5e] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
