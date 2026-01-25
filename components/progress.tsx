'use client';

interface Business {
  id: number;
  name: string;
  website: string | null;
  email: string | null;
  email_confidence: number;
  phone: string | null;
  address: string | null;
  source: string;
}

interface ProgressProps {
  progress: number;
  message: string;
  query: string;
  location?: string;
  businesses?: Business[];
  targetCount?: number;
}

function BusinessCard({ business, index }: { business: Business; index: number }) {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-400';
    if (confidence >= 0.6) return 'text-yellow-400';
    if (confidence >= 0.4) return 'text-orange-400';
    return 'text-gray-500';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'Verified';
    if (confidence >= 0.6) return 'Likely';
    if (confidence >= 0.4) return 'Check';
    return 'Low';
  };

  return (
    <div
      className="bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg p-3 animate-fade-in"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-white truncate">{business.name}</h4>
          {business.email && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[#64ffda] text-sm truncate">{business.email}</span>
              <span className={`text-xs ${getConfidenceColor(business.email_confidence)}`}>
                {getConfidenceLabel(business.email_confidence)}
              </span>
            </div>
          )}
          {!business.email && (
            <span className="text-gray-500 text-sm">Finding email...</span>
          )}
        </div>
        <div className="text-right text-xs text-gray-500 shrink-0">
          {business.source.replace(/_/g, ' ')}
        </div>
      </div>
      {(business.phone || business.website) && (
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
          {business.phone && <span>{business.phone}</span>}
          {business.website && (
            <a
              href={business.website}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#64ffda] truncate max-w-[150px]"
            >
              {business.website.replace(/^https?:\/\/(www\.)?/, '')}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export function Progress({ progress, message, query, location, businesses = [], targetCount }: ProgressProps) {
  const emailCount = businesses.filter(b => b.email).length;
  const verifiedCount = businesses.filter(b => b.email_confidence >= 0.8).length;

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-semibold text-white mb-2">Finding Leads</h2>
        <p className="text-[#8892b0]">
          Searching for <span className="text-[#64ffda]">{query}</span>
          {location && <span> in <span className="text-[#64ffda]">{location}</span></span>}
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="h-3 bg-[#1a1a2e] rounded-full overflow-hidden">
          <div
            className="h-full progress-shimmer rounded-full transition-all duration-500"
            style={{ width: `${Math.max(progress, 2)}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-sm">
          <span className="text-[#8892b0]">{message}</span>
          <span className="text-[#64ffda] font-medium">{progress}%</span>
        </div>
      </div>

      {/* Live stats */}
      {businesses.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-[#1a1a2e] rounded-lg p-3 border border-[#2a2a4e] text-center">
            <div className="text-2xl font-bold text-white">{businesses.length}</div>
            <div className="text-[#8892b0] text-xs">
              {targetCount ? `of ${targetCount}` : 'Found'}
            </div>
          </div>
          <div className="bg-[#1a1a2e] rounded-lg p-3 border border-[#2a2a4e] text-center">
            <div className="text-2xl font-bold text-[#64ffda]">{emailCount}</div>
            <div className="text-[#8892b0] text-xs">With Email</div>
          </div>
          <div className="bg-[#1a1a2e] rounded-lg p-3 border border-[#2a2a4e] text-center">
            <div className="text-2xl font-bold text-green-400">{verifiedCount}</div>
            <div className="text-[#8892b0] text-xs">Verified</div>
          </div>
        </div>
      )}

      {/* Spinner when no results yet */}
      {businesses.length === 0 && (
        <div className="flex items-center justify-center gap-2 text-[#8892b0] mb-6">
          <svg className="animate-spin h-5 w-5 text-[#64ffda]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Searching for businesses...</span>
        </div>
      )}

      {/* Live results list */}
      {businesses.length > 0 && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-[#8892b0]">Leads Found</h3>
            <div className="flex items-center gap-2 text-xs text-[#8892b0]">
              <svg className="animate-spin h-3 w-3 text-[#64ffda]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Live updating...</span>
            </div>
          </div>
          {businesses.map((business, index) => (
            <BusinessCard key={business.id} business={business} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}
