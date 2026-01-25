'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { LeadForm, type SearchFilters } from '@/components/lead-form';
import { Progress } from '@/components/progress';
import { Results } from '@/components/results';

type AppState = 'form' | 'progress' | 'results';

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

interface JobData {
  id: string;
  status: string;
  progress: number;
  message: string;
  query: string;
  location?: string;
  targetCount?: number;
  results?: { total: number; withEmail: number; verified: number; businesses?: Business[] };
}

interface HistoryItem {
  id: string;
  query: string;
  location: string | null;
  target_count: number;
  status: string;
  created_at: string;
  total_leads: number;
  emails_found: number;
  verified_emails: number;
}

function SearchHistory({ history, onSelect }: { history: HistoryItem[]; onSelect: (item: HistoryItem) => void }) {
  if (history.length === 0) return null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="mt-8">
      <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Recent Searches
      </h2>
      <div className="space-y-2">
        {history.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className="w-full text-left bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg p-4 transition-all group"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white truncate">{item.query}</span>
                  {item.location && (
                    <span className="text-gray-400 text-sm truncate">in {item.location}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
                  <span>{item.total_leads} leads</span>
                  <span>{item.emails_found} emails</span>
                  <span className="text-emerald-400">{item.verified_emails} verified</span>
                </div>
              </div>
              <div className="flex items-center gap-3 ml-4">
                <span className="text-xs text-gray-500">{formatDate(item.created_at)}</span>
                <svg className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function HowItWorks() {
  return (
    <div className="mt-12 text-gray-300">
      <h2 className="text-2xl font-semibold text-white mb-6 text-center">How It Works</h2>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="bg-white/5 rounded-xl p-6 border border-white/10">
          <div className="text-3xl mb-3">1</div>
          <h3 className="text-lg font-medium text-white mb-2">Search the Web</h3>
          <p className="text-sm text-gray-400">
            We search multiple sources based on your query. For local businesses, we scan Google Maps, Yelp,
            Yellow Pages, and the Better Business Bureau. For online brands, we search Google and Instagram.
          </p>
        </div>

        <div className="bg-white/5 rounded-xl p-6 border border-white/10">
          <div className="text-3xl mb-3">2</div>
          <h3 className="text-lg font-medium text-white mb-2">Find Contact Info</h3>
          <p className="text-sm text-gray-400">
            For each business found, we visit their website and scan common pages like Contact, About,
            and Team to find email addresses. We prioritize business emails (info@, contact@) over generic ones.
          </p>
        </div>

        <div className="bg-white/5 rounded-xl p-6 border border-white/10">
          <div className="text-3xl mb-3">3</div>
          <h3 className="text-lg font-medium text-white mb-2">Export Your Leads</h3>
          <p className="text-sm text-gray-400">
            Download a formatted Excel file with business names, websites, emails, phone numbers,
            and addresses. Emails are color-coded by confidence level so you know which ones to prioritize.
          </p>
        </div>
      </div>

      <div className="mt-8 bg-white/5 rounded-xl p-6 border border-white/10">
        <h3 className="text-lg font-medium text-white mb-3">Under the Hood</h3>
        <p className="text-sm text-gray-400 mb-4">
          This tool uses a cloud browser service to visit websites just like a real person would.
          When you start a search:
        </p>
        <ul className="text-sm text-gray-400 space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-emerald-400 mt-1">•</span>
            <span><strong className="text-gray-300">Discovery:</strong> A headless browser searches Google Maps, Yelp, Yellow Pages, and BBB, scrolling through listings and extracting business details like name, phone, address, and website URL from each source.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-400 mt-1">•</span>
            <span><strong className="text-gray-300">Email Extraction:</strong> For each business with a website, we visit their homepage plus common contact pages, scanning the HTML for email patterns and mailto: links.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-400 mt-1">•</span>
            <span><strong className="text-gray-300">Smart Filtering:</strong> We skip generic email providers (Gmail, Yahoo) and only keep emails that match the business domain. If no email is found, we generate a likely address (info@domain.com) marked as lower confidence.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-400 mt-1">•</span>
            <span><strong className="text-gray-300">Results Storage:</strong> All data is saved to a database so you can download your leads anytime as a formatted spreadsheet.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default function Home() {
  const [appState, setAppState] = useState<AppState>('form');
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch search history on mount and when returning to form
  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/history');
      const data = await response.json();
      if (data.history) setHistory(data.history);
    } catch (e) {
      console.error('Failed to fetch history:', e);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Connect to SSE stream for live updates
  const connectToStream = useCallback((jobId: string, query: string, location?: string, targetCount?: number) => {
    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`/api/jobs/${jobId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('status', (event) => {
      const data = JSON.parse(event.data);
      setJobData(prev => prev ? { ...prev, ...data } : null);
    });

    eventSource.addEventListener('businesses', (event) => {
      const newBusinesses: Business[] = JSON.parse(event.data);
      setBusinesses(prev => {
        // Merge new businesses, avoiding duplicates by ID
        const existingIds = new Set(prev.map(b => b.id));
        const uniqueNew = newBusinesses.filter(b => !existingIds.has(b.id));
        return [...prev, ...uniqueNew];
      });
    });

    eventSource.addEventListener('done', (event) => {
      const data = JSON.parse(event.data);
      eventSource.close();
      eventSourceRef.current = null;

      if (data.status === 'completed') {
        // Fetch final results
        fetch(`/api/jobs/${jobId}`)
          .then(res => res.json())
          .then(finalData => {
            setJobData({
              id: finalData.id,
              status: finalData.status,
              progress: finalData.progress,
              message: finalData.message,
              query: finalData.query,
              location: finalData.location,
              targetCount: finalData.targetCount,
              results: finalData.results,
            });
            setAppState('results');
          });
      } else if (data.status === 'failed') {
        setError('Search failed. Please try again.');
        setAppState('form');
        setIsLoading(false);
      }
    });

    eventSource.onerror = () => {
      // On error, fall back to polling
      console.warn('SSE connection error, falling back to polling');
      eventSource.close();
      eventSourceRef.current = null;
      startPolling(jobId);
    };

    // Initialize job data
    setJobData({
      id: jobId,
      status: 'pending',
      progress: 0,
      message: 'Starting...',
      query,
      location,
      targetCount,
    });
    setBusinesses([]);
    setAppState('progress');
  }, []);

  // Fallback polling for environments where SSE doesn't work
  const startPolling = useCallback((jobId: string) => {
    const poll = async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        const data = await response.json();

        setJobData(prev => ({
          ...prev!,
          status: data.status,
          progress: data.progress,
          message: data.message,
        }));

        if (data.results?.businesses) {
          setBusinesses(data.results.businesses);
        }

        if (data.status === 'completed') {
          setJobData({
            id: data.id,
            status: data.status,
            progress: data.progress,
            message: data.message,
            query: data.query,
            location: data.location,
            targetCount: data.targetCount,
            results: data.results,
          });
          setAppState('results');
        } else if (data.status === 'failed') {
          setError(data.message);
          setAppState('form');
          setIsLoading(false);
        } else {
          // Continue polling
          setTimeout(poll, 1500);
        }
      } catch (e) {
        console.error('Polling error:', e);
        setTimeout(poll, 2000);
      }
    };

    poll();
  }, []);

  const handleSubmit = async (filters: SearchFilters) => {
    setIsLoading(true);
    setError(null);
    setBusinesses([]);

    // Build location string based on location type
    let fullLocation = filters.location;
    const state = filters.targetState;

    if (filters.locationType === 'radius' && filters.radius && fullLocation) {
      // For radius search: "within 25 miles of Hicksville, NY"
      fullLocation = state
        ? `within ${filters.radius} miles of ${fullLocation}, ${state}`
        : `within ${filters.radius} miles of ${fullLocation}`;
    } else if (filters.locationType === 'county' && fullLocation) {
      // For county search: "Nassau County, NY"
      const countyName = fullLocation.toLowerCase().includes('county')
        ? fullLocation
        : `${fullLocation} County`;
      fullLocation = state ? `${countyName}, ${state}` : countyName;
    } else {
      // For city search: "Austin, TX"
      if (state && fullLocation && !fullLocation.includes(state)) {
        fullLocation = `${fullLocation}, ${state}`;
      } else if (state && !fullLocation) {
        fullLocation = state;
      }
    }

    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: filters.query,
          location: fullLocation,
          count: filters.count,
          industryCategory: filters.industryCategory || null,
          companySizeMin: filters.companySizeMin,
          companySizeMax: filters.companySizeMax,
          targetState: filters.targetState || null,
          b2cOnly: filters.b2cOnly,
          locationType: filters.locationType,
          radius: filters.radius,
        }),
      });
      const { jobId } = await response.json();

      // Use SSE streaming for live updates
      connectToStream(jobId, filters.query, fullLocation || undefined, filters.count);
    } catch (e) {
      setError('Failed to start search. Please try again.');
      setIsLoading(false);
    }
  };

  const handleHistorySelect = async (item: HistoryItem) => {
    // Fetch full job data and show results
    try {
      const response = await fetch(`/api/jobs/${item.id}`);
      const data = await response.json();
      if (data.status === 'completed') {
        setJobData({
          id: data.id,
          status: data.status,
          progress: data.progress,
          message: data.message,
          query: data.query,
          location: data.location,
          results: data.results
        });
        setAppState('results');
      }
    } catch (e) {
      setError('Failed to load search results');
    }
  };

  const handleNewSearch = () => {
    // Close any active SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setJobData(null);
    setBusinesses([]);
    setError(null);
    setIsLoading(false);
    setAppState('form');
    fetchHistory(); // Refresh history
  };

  return (
    <main className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        {error && <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-center">{error}</div>}
        {appState === 'form' && (
          <>
            <LeadForm onSubmit={handleSubmit} isLoading={isLoading} />
            {!historyLoading && <SearchHistory history={history} onSelect={handleHistorySelect} />}
            <HowItWorks />
          </>
        )}
        {appState === 'progress' && jobData && (
          <Progress
            progress={jobData.progress}
            message={jobData.message}
            query={jobData.query}
            location={jobData.location}
            businesses={businesses}
            targetCount={jobData.targetCount}
          />
        )}
        {appState === 'results' && jobData?.results && <Results jobId={jobData.id} query={jobData.query} location={jobData.location} stats={jobData.results} onNewSearch={handleNewSearch} />}
      </div>
    </main>
  );
}
