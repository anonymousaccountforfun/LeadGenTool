'use client';
import { useEffect, useState } from 'react';

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

// ============ Skeleton Components ============

function SkeletonCard() {
  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg p-3 animate-pulse">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="h-4 bg-[#2a2a4e] rounded w-3/4 mb-2" />
          <div className="h-3 bg-[#2a2a4e] rounded w-1/2" />
        </div>
        <div className="h-3 bg-[#2a2a4e] rounded w-16" />
      </div>
      <div className="flex gap-3 mt-2">
        <div className="h-3 bg-[#2a2a4e] rounded w-24" />
        <div className="h-3 bg-[#2a2a4e] rounded w-32" />
      </div>
    </div>
  );
}

function SkeletonStats() {
  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-[#1a1a2e] rounded-lg p-3 border border-[#2a2a4e] text-center animate-pulse">
          <div className="h-8 bg-[#2a2a4e] rounded w-12 mx-auto mb-2" />
          <div className="h-3 bg-[#2a2a4e] rounded w-16 mx-auto" />
        </div>
      ))}
    </div>
  );
}

// ============ Phase Indicator ============

type Phase = 'discovery' | 'finding-emails' | 'verification' | 'complete';

function getPhase(progress: number, message: string): Phase {
  if (progress >= 95) return 'complete';
  const msg = (message || '').toLowerCase();
  if (msg.includes('verif')) return 'verification';
  if (msg.includes('email') || msg.includes('batch')) return 'finding-emails';
  return 'discovery';
}

function PhaseIndicator({ currentPhase }: { currentPhase: Phase }) {
  const phases: { id: Phase; label: string; icon: string }[] = [
    { id: 'discovery', label: 'Discovery', icon: '🔍' },
    { id: 'finding-emails', label: 'Finding Emails', icon: '📧' },
    { id: 'verification', label: 'Verification', icon: '✓' },
  ];

  const currentIndex = phases.findIndex(p => p.id === currentPhase);

  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {phases.map((phase, index) => {
        const isActive = index === currentIndex;
        const isComplete = index < currentIndex || currentPhase === 'complete';

        return (
          <div key={phase.id} className="flex items-center">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                isActive
                  ? 'bg-[#64ffda]/20 text-[#64ffda] border border-[#64ffda]/30'
                  : isComplete
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-[#1a1a2e] text-gray-500 border border-[#2a2a4e]'
              }`}
            >
              <span>{isComplete ? '✓' : phase.icon}</span>
              <span className="hidden sm:inline">{phase.label}</span>
            </div>
            {index < phases.length - 1 && (
              <div
                className={`w-8 h-0.5 mx-1 ${
                  isComplete ? 'bg-green-500/50' : 'bg-[#2a2a4e]'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============ Stats Counter with Animation ============

function AnimatedCounter({ value, label, color }: { value: number; label: string; color: string }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const diff = value - displayValue;
    if (diff === 0) return;

    const step = diff > 0 ? 1 : -1;
    const timer = setTimeout(() => {
      setDisplayValue(prev => prev + step);
    }, 50);

    return () => clearTimeout(timer);
  }, [value, displayValue]);

  return (
    <div className="bg-[#1a1a2e] rounded-lg p-3 border border-[#2a2a4e] text-center">
      <div className={`text-2xl font-bold ${color} tabular-nums`}>{displayValue}</div>
      <div className="text-[#8892b0] text-xs">{label}</div>
    </div>
  );
}

// ============ Business Card ============

function confidenceToScore(confidence: number): number {
  return Math.round(confidence * 100);
}

function BusinessCard({ business, index }: { business: Business; index: number }) {
  const getConfidenceColor = (confidence: number) => {
    const score = confidenceToScore(confidence);
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-emerald-400';
    if (score >= 40) return 'text-yellow-400';
    if (score >= 20) return 'text-orange-400';
    return 'text-gray-500';
  };

  const getConfidenceLabel = (confidence: number) => {
    const score = confidenceToScore(confidence);
    if (score >= 80) return `Verified (${score})`;
    if (score >= 60) return `Likely (${score})`;
    if (score >= 40) return `Check (${score})`;
    if (score >= 20) return `Low (${score})`;
    return `Unverified (${score})`;
  };

  const isNew = index < 3; // Highlight recently added items

  return (
    <div
      className={`bg-[#1a1a2e] border rounded-lg p-3 animate-fade-in transition-all ${
        isNew ? 'border-[#64ffda]/50 shadow-lg shadow-[#64ffda]/5' : 'border-[#2a2a4e]'
      }`}
      style={{ animationDelay: `${Math.min(index * 50, 200)}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-white truncate">{business.name}</h4>
            {isNew && (
              <span className="px-1.5 py-0.5 text-[10px] bg-[#64ffda]/20 text-[#64ffda] rounded">NEW</span>
            )}
          </div>
          {business.email && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[#64ffda] text-sm truncate">{business.email}</span>
              <span className={`text-xs ${getConfidenceColor(business.email_confidence)}`}>
                {getConfidenceLabel(business.email_confidence)}
              </span>
            </div>
          )}
          {!business.email && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-gray-500 text-sm">Finding email...</span>
              <div className="flex gap-0.5">
                <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
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

// ============ Main Progress Component ============

export function Progress({ progress, message, query, location, businesses = [], targetCount }: ProgressProps) {
  const emailCount = businesses.filter(b => b.email).length;
  const verifiedCount = businesses.filter(b => b.email_confidence >= 0.8).length;
  const currentPhase = getPhase(progress, message);
  const isLoading = businesses.length === 0;

  // Sort businesses to show newest first
  const sortedBusinesses = [...businesses].reverse();

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

      {/* Phase indicator */}
      <PhaseIndicator currentPhase={currentPhase} />

      {/* Progress bar with gradient */}
      <div className="mb-6">
        <div className="h-3 bg-[#1a1a2e] rounded-full overflow-hidden relative">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${Math.max(progress, 2)}%`,
              background: 'linear-gradient(90deg, #64ffda 0%, #7effea 50%, #64ffda 100%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 2s infinite',
            }}
          />
          {/* Pulse effect at the edge */}
          {progress < 100 && (
            <div
              className="absolute top-0 bottom-0 w-2 bg-white/30 rounded-full animate-pulse"
              style={{ left: `calc(${progress}% - 4px)` }}
            />
          )}
        </div>
        <div className="mt-2 flex justify-between text-sm">
          <span className="text-[#8892b0]">{message}</span>
          <span className="text-[#64ffda] font-medium tabular-nums">{progress}%</span>
        </div>
      </div>

      {/* Stats - show skeleton when loading */}
      {isLoading ? (
        <SkeletonStats />
      ) : (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <AnimatedCounter
            value={businesses.length}
            label={targetCount ? `of ${targetCount}` : 'Found'}
            color="text-white"
          />
          <AnimatedCounter value={emailCount} label="With Email" color="text-[#64ffda]" />
          <AnimatedCounter value={verifiedCount} label="Verified" color="text-green-400" />
        </div>
      )}

      {/* Loading state with skeletons */}
      {isLoading && (
        <>
          <div className="flex items-center justify-center gap-2 text-[#8892b0] mb-4">
            <svg className="animate-spin h-5 w-5 text-[#64ffda]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Searching for businesses...</span>
          </div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </>
      )}

      {/* Live results list */}
      {!isLoading && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
          <div className="flex items-center justify-between mb-2 sticky top-0 bg-[#0a0a0f] py-2 -mt-2">
            <h3 className="text-sm font-medium text-[#8892b0]">
              Leads Found
              <span className="ml-2 text-gray-500">({businesses.length})</span>
            </h3>
            <div className="flex items-center gap-2 text-xs text-[#8892b0]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#64ffda] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#64ffda]" />
              </span>
              <span>Live updating</span>
            </div>
          </div>
          {sortedBusinesses.map((business, index) => (
            <BusinessCard key={business.id} business={business} index={index} />
          ))}
        </div>
      )}

      {/* CSS for shimmer animation */}
      <style jsx>{`
        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </div>
  );
}
