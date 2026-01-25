'use client';
import { useState } from 'react';
import { SaveSearchButton } from './save-search-button';

interface Business {
  id: number;
  name: string;
  website: string | null;
  email: string | null;
  email_confidence: number;
  phone: string | null;
  address: string | null;
  source: string;
  created_at?: string;
}

// ============ Data Freshness Utilities ============

type FreshnessLevel = 'fresh' | 'recent' | 'aging' | 'stale';

interface FreshnessInfo {
  level: FreshnessLevel;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

function calculateFreshness(timestamp?: string): FreshnessInfo {
  if (!timestamp) {
    return {
      level: 'fresh',
      label: 'New',
      color: 'text-green-400',
      bgColor: 'bg-green-500/20',
      borderColor: 'border-green-500/30',
    };
  }

  const date = new Date(timestamp);
  const now = new Date();
  const ageMs = now.getTime() - date.getTime();
  const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));

  if (ageDays < 1) {
    return { level: 'fresh', label: 'Fresh', color: 'text-green-400', bgColor: 'bg-green-500/20', borderColor: 'border-green-500/30' };
  }
  if (ageDays < 7) {
    return { level: 'recent', label: `${ageDays}d`, color: 'text-blue-400', bgColor: 'bg-blue-500/20', borderColor: 'border-blue-500/30' };
  }
  if (ageDays < 30) {
    return { level: 'aging', label: `${Math.floor(ageDays / 7)}w`, color: 'text-yellow-400', bgColor: 'bg-yellow-500/20', borderColor: 'border-yellow-500/30' };
  }
  return { level: 'stale', label: `${Math.floor(ageDays / 30)}mo`, color: 'text-orange-400', bgColor: 'bg-orange-500/20', borderColor: 'border-orange-500/30' };
}

function FreshnessBadge({ timestamp }: { timestamp?: string }) {
  const freshness = calculateFreshness(timestamp);

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${freshness.bgColor} ${freshness.color} ${freshness.borderColor}`}
      title={timestamp ? `Data from ${new Date(timestamp).toLocaleDateString()}` : 'Just scraped'}
    >
      {freshness.label}
    </span>
  );
}

interface ResultsProps {
  jobId: string;
  query: string;
  location?: string;
  stats: {
    total: number;
    withEmail: number;
    verified: number;
    businesses?: Business[];
  };
  filters?: Record<string, unknown>;
  onNewSearch: () => void;
}

// Convert 0-1 confidence to 0-100 score for display
function confidenceToScore(confidence: number): number {
  return Math.round(confidence * 100);
}

// Get badge color based on confidence score
function getConfidenceBadgeStyle(confidence: number): { bg: string; text: string; border: string } {
  const score = confidenceToScore(confidence);
  if (score >= 80) return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' };
  if (score >= 60) return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' };
  if (score >= 40) return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' };
  if (score >= 20) return { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' };
  return { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' };
}

// Get status label based on confidence score
function getConfidenceLabel(confidence: number): string {
  const score = confidenceToScore(confidence);
  if (score >= 80) return 'Verified';
  if (score >= 60) return 'Likely Valid';
  if (score >= 40) return 'Uncertain';
  if (score >= 20) return 'Low Confidence';
  return 'Unverified';
}

// Get icon based on confidence score
function ConfidenceIcon({ confidence }: { confidence: number }) {
  const score = confidenceToScore(confidence);

  if (score >= 80) {
    // Checkmark icon
    return (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (score >= 60) {
    // Partial check
    return (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
      </svg>
    );
  }
  if (score >= 40) {
    // Question mark
    return (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01" />
      </svg>
    );
  }
  // Warning icon for low confidence
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const style = getConfidenceBadgeStyle(confidence);
  const label = getConfidenceLabel(confidence);
  const score = confidenceToScore(confidence);

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}>
      <ConfidenceIcon confidence={confidence} />
      <span>{label}</span>
      <span className="opacity-70">({score})</span>
    </div>
  );
}

type ReportType = 'wrong_email' | 'disconnected_phone' | 'wrong_address' | 'closed_business' | 'duplicate' | 'other';

function ReportButton({ businessId, hasEmail, hasPhone }: { businessId: number; hasEmail: boolean; hasPhone: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const reportOptions: { type: ReportType; label: string; show: boolean }[] = [
    { type: 'wrong_email', label: 'Wrong email', show: hasEmail },
    { type: 'disconnected_phone', label: 'Phone disconnected', show: hasPhone },
    { type: 'wrong_address', label: 'Wrong address', show: true },
    { type: 'closed_business', label: 'Business closed', show: true },
    { type: 'duplicate', label: 'Duplicate entry', show: true },
    { type: 'other', label: 'Other issue', show: true },
  ];

  const handleReport = async (type: ReportType) => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, reportType: type }),
      });

      if (response.ok) {
        setSubmitted(true);
        setIsOpen(false);
      }
    } catch (error) {
      console.error('Failed to submit report:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="mt-3 pt-3 border-t border-[#2a2a4e] flex items-center gap-2 text-xs text-green-400">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span>Thanks for the feedback!</span>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-[#2a2a4e]">
      {!isOpen ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(true);
          }}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-orange-400 active:text-orange-400 transition-colors touch-manipulation min-h-[44px]"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>Report an issue</span>
        </button>
      ) : (
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          <p className="text-xs text-gray-400">What&apos;s wrong with this data?</p>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {reportOptions
              .filter((opt) => opt.show)
              .map((opt) => (
                <button
                  key={opt.type}
                  onClick={() => handleReport(opt.type)}
                  disabled={isSubmitting}
                  className="px-2.5 sm:px-2 py-2 sm:py-1 text-xs bg-[#2a2a4e] hover:bg-orange-500/20 active:bg-orange-500/20 hover:text-orange-400 active:text-orange-400 text-gray-400 rounded border border-[#3a3a5e] hover:border-orange-500/30 active:border-orange-500/30 transition-colors disabled:opacity-50 touch-manipulation min-h-[36px] sm:min-h-0"
                >
                  {opt.label}
                </button>
              ))}
            <button
              onClick={() => setIsOpen(false)}
              className="px-2.5 sm:px-2 py-2 sm:py-1 text-xs text-gray-500 hover:text-gray-400 active:text-gray-400 touch-manipulation min-h-[36px] sm:min-h-0"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BusinessRow({ business }: { business: Business }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg overflow-hidden hover:border-[#3a3a5e] active:border-[#3a3a5e] transition-colors">
      <div
        className="p-3 sm:p-4 cursor-pointer touch-manipulation min-h-[64px] flex items-center"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-2 sm:gap-3 w-full">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <h4 className="font-medium text-white text-sm sm:text-base truncate max-w-[180px] sm:max-w-none">{business.name}</h4>
              <span className="text-[10px] sm:text-xs text-gray-500 shrink-0">{business.source.replace(/_/g, ' ')}</span>
              <FreshnessBadge timestamp={business.created_at} />
            </div>
            {business.email ? (
              <div className="flex items-center gap-1.5 sm:gap-2 mt-1.5 flex-wrap">
                <a
                  href={`mailto:${business.email}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[#64ffda] text-xs sm:text-sm hover:underline active:underline truncate max-w-[200px] sm:max-w-[250px]"
                >
                  {business.email}
                </a>
                <ConfidenceBadge confidence={business.email_confidence} />
              </div>
            ) : (
              <span className="text-gray-500 text-xs sm:text-sm mt-1.5 block">No email found</span>
            )}
          </div>
          <svg
            className={`w-5 h-5 sm:w-5 sm:h-5 text-gray-500 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-0 border-t border-[#2a2a4e] mt-0 space-y-2">
          <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {business.phone && (
              <div>
                <span className="text-gray-500 text-xs block mb-0.5">Phone</span>
                <a
                  href={`tel:${business.phone}`}
                  className="text-[#8892b0] hover:text-[#64ffda] active:text-[#64ffda] touch-manipulation inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0"
                >
                  <svg className="w-4 h-4 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {business.phone}
                </a>
              </div>
            )}
            {business.website && (
              <div>
                <span className="text-gray-500 text-xs block mb-0.5">Website</span>
                <a
                  href={business.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#8892b0] hover:text-[#64ffda] active:text-[#64ffda] truncate block touch-manipulation min-h-[44px] sm:min-h-0 flex items-center"
                >
                  {business.website.replace(/^https?:\/\/(www\.)?/, '')}
                </a>
              </div>
            )}
            {business.address && (
              <div className="col-span-1 sm:col-span-2">
                <span className="text-gray-500 text-xs block mb-0.5">Address</span>
                <span className="text-[#8892b0] text-sm">{business.address}</span>
              </div>
            )}
          </div>
          <ReportButton businessId={business.id} hasEmail={!!business.email} hasPhone={!!business.phone} />
        </div>
      )}
    </div>
  );
}

function ConfidenceLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-[10px] sm:text-xs">
      <div className="flex items-center gap-1 sm:gap-1.5">
        <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-green-400" />
        <span className="text-gray-400">Verified (80+)</span>
      </div>
      <div className="flex items-center gap-1 sm:gap-1.5">
        <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-400" />
        <span className="text-gray-400">Likely (60-79)</span>
      </div>
      <div className="flex items-center gap-1 sm:gap-1.5">
        <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-yellow-400" />
        <span className="text-gray-400">Uncertain (40-59)</span>
      </div>
      <div className="flex items-center gap-1 sm:gap-1.5">
        <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-orange-400" />
        <span className="text-gray-400">Low (20-39)</span>
      </div>
      <div className="flex items-center gap-1 sm:gap-1.5">
        <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-gray-400" />
        <span className="text-gray-400">Unverified (&lt;20)</span>
      </div>
    </div>
  );
}

function FreshnessLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-[10px] sm:text-xs">
      <span className="text-gray-500 mr-0.5 sm:mr-1">Data Age:</span>
      <div className="flex items-center gap-0.5 sm:gap-1">
        <span className="px-1 sm:px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30 text-[9px] sm:text-[10px]">Fresh</span>
        <span className="text-gray-500">&lt;24h</span>
      </div>
      <div className="flex items-center gap-0.5 sm:gap-1">
        <span className="px-1 sm:px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[9px] sm:text-[10px]">1-7d</span>
        <span className="text-gray-500">recent</span>
      </div>
      <div className="flex items-center gap-0.5 sm:gap-1">
        <span className="px-1 sm:px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-[9px] sm:text-[10px]">1-4w</span>
        <span className="text-gray-500">aging</span>
      </div>
      <div className="flex items-center gap-0.5 sm:gap-1">
        <span className="px-1 sm:px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 text-[9px] sm:text-[10px]">1mo+</span>
        <span className="text-gray-500">stale</span>
      </div>
    </div>
  );
}

export function Results({ jobId, query, location, stats, filters, onNewSearch }: ResultsProps) {
  const [filter, setFilter] = useState<'all' | 'verified' | 'email'>('all');
  const businesses = stats.businesses || [];

  const filteredBusinesses = businesses.filter((b) => {
    if (filter === 'verified') return b.email_confidence >= 0.8;
    if (filter === 'email') return b.email !== null;
    return true;
  });

  return (
    <div className="w-full max-w-2xl mx-auto px-4 sm:px-0">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-14 h-14 sm:w-16 sm:h-16 bg-[#64ffda]/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 sm:w-8 sm:h-8 text-[#64ffda]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl sm:text-2xl font-semibold text-white mb-2">Leads Found!</h2>
        <p className="text-[#8892b0] text-sm sm:text-base">
          Results for <span className="text-[#64ffda]">{query}</span>
          {location && <span> in <span className="text-[#64ffda]">{location}</span></span>}
        </p>
        {/* Save Search Button */}
        <div className="mt-4 flex justify-center">
          <SaveSearchButton
            query={query}
            location={location}
            filters={filters}
          />
        </div>
      </div>

      {/* Stats Cards - Stack on mobile, 3 cols on desktop */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`rounded-lg p-3 sm:p-4 border transition-colors touch-manipulation active:scale-95 min-h-[72px] sm:min-h-0 ${
            filter === 'all'
              ? 'bg-[#1a1a2e] border-[#64ffda]'
              : 'bg-[#1a1a2e] border-[#2a2a4e] hover:border-[#3a3a5e] active:border-[#3a3a5e]'
          }`}
        >
          <div className="text-2xl sm:text-3xl font-bold text-white mb-1">{stats.total}</div>
          <div className="text-[#8892b0] text-xs sm:text-sm">Total Leads</div>
        </button>
        <button
          onClick={() => setFilter('email')}
          className={`rounded-lg p-3 sm:p-4 border transition-colors touch-manipulation active:scale-95 min-h-[72px] sm:min-h-0 ${
            filter === 'email'
              ? 'bg-[#1a1a2e] border-[#64ffda]'
              : 'bg-[#1a1a2e] border-[#2a2a4e] hover:border-[#3a3a5e] active:border-[#3a3a5e]'
          }`}
        >
          <div className="text-2xl sm:text-3xl font-bold text-[#64ffda] mb-1">{stats.withEmail}</div>
          <div className="text-[#8892b0] text-xs sm:text-sm">With Email</div>
        </button>
        <button
          onClick={() => setFilter('verified')}
          className={`rounded-lg p-3 sm:p-4 border transition-colors touch-manipulation active:scale-95 min-h-[72px] sm:min-h-0 ${
            filter === 'verified'
              ? 'bg-[#1a1a2e] border-[#64ffda]'
              : 'bg-[#1a1a2e] border-[#2a2a4e] hover:border-[#3a3a5e] active:border-[#3a3a5e]'
          }`}
        >
          <div className="text-2xl sm:text-3xl font-bold text-green-400 mb-1">{stats.verified}</div>
          <div className="text-[#8892b0] text-xs sm:text-sm">Verified</div>
        </button>
      </div>

      {/* Legends - collapsible on mobile */}
      <div className="mb-6 p-2 sm:p-3 bg-[#1a1a2e] rounded-lg border border-[#2a2a4e] space-y-2 sm:space-y-3">
        <ConfidenceLegend />
        <div className="border-t border-[#2a2a4e] pt-2">
          <FreshnessLegend />
        </div>
      </div>

      {/* Business List */}
      {businesses.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs sm:text-sm font-medium text-[#8892b0]">
              {filter === 'all' && 'All Leads'}
              {filter === 'email' && 'Leads with Email'}
              {filter === 'verified' && 'Verified Leads'}
              <span className="ml-2 text-gray-500">({filteredBusinesses.length})</span>
            </h3>
          </div>
          <div className="space-y-2 max-h-[50vh] sm:max-h-[400px] overflow-y-auto pr-1 sm:pr-2 custom-scrollbar -mx-1 px-1">
            {filteredBusinesses.map((business) => (
              <BusinessRow key={business.id} business={business} />
            ))}
            {filteredBusinesses.length === 0 && (
              <div className="text-center py-8 text-gray-500 text-sm">
                No leads match this filter
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons - Fixed bottom on mobile for easy thumb access */}
      <div className="space-y-3 sm:space-y-4 pb-safe">
        <button
          onClick={() => window.location.href = `/api/jobs/${jobId}/download`}
          className="w-full py-4 sm:py-4 min-h-[56px] bg-[#64ffda] text-[#0a0a0f] font-semibold rounded-lg hover:bg-[#7effea] active:bg-[#50e6c2] flex items-center justify-center gap-2 touch-manipulation transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download Excel
        </button>
        <button
          onClick={onNewSearch}
          className="w-full py-3 sm:py-3 min-h-[48px] bg-transparent border border-[#2a2a4e] text-[#8892b0] rounded-lg hover:border-[#64ffda] hover:text-[#64ffda] active:border-[#64ffda] active:text-[#64ffda] touch-manipulation transition-colors"
        >
          Start New Search
        </button>
      </div>

      {/* Tip */}
      <div className="mt-6 p-3 sm:p-4 bg-[#1a1a2e] rounded-lg border border-[#2a2a4e]">
        <p className="text-[#8892b0] text-xs sm:text-sm">
          <span className="text-[#64ffda]">Tip:</span> Tap on any lead to expand details.
          The Excel download includes all contact information with confidence scores color-coded.
        </p>
      </div>
    </div>
  );
}
