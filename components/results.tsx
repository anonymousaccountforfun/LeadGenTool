'use client';
export function Results({ jobId, query, location, stats, onNewSearch }: { jobId: string; query: string; location?: string; stats: { total: number; withEmail: number; verified: number }; onNewSearch: () => void }) {
  return (
    <div className="w-full max-w-2xl mx-auto text-center">
      <div className="mb-8">
        <div className="w-16 h-16 bg-[#64ffda]/20 rounded-full flex items-center justify-center mx-auto mb-4"><svg className="w-8 h-8 text-[#64ffda]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></div>
        <h2 className="text-2xl font-semibold text-white mb-2">Leads Found!</h2>
        <p className="text-[#8892b0]">Results for <span className="text-[#64ffda]">{query}</span>{location && <span> in <span className="text-[#64ffda]">{location}</span></span>}</p>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-[#1a1a2e] rounded-lg p-4 border border-[#2a2a4e]"><div className="text-3xl font-bold text-white mb-1">{stats.total}</div><div className="text-[#8892b0] text-sm">Total Leads</div></div>
        <div className="bg-[#1a1a2e] rounded-lg p-4 border border-[#2a2a4e]"><div className="text-3xl font-bold text-[#64ffda] mb-1">{stats.withEmail}</div><div className="text-[#8892b0] text-sm">With Email</div></div>
        <div className="bg-[#1a1a2e] rounded-lg p-4 border border-[#2a2a4e]"><div className="text-3xl font-bold text-green-400 mb-1">{stats.verified}</div><div className="text-[#8892b0] text-sm">Verified</div></div>
      </div>
      <div className="space-y-4">
        <button onClick={() => window.location.href = `/api/jobs/${jobId}/download`} className="w-full py-4 bg-[#64ffda] text-[#0a0a0f] font-semibold rounded-lg hover:bg-[#7effea] flex items-center justify-center gap-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Download Excel</button>
        <button onClick={onNewSearch} className="w-full py-3 bg-transparent border border-[#2a2a4e] text-[#8892b0] rounded-lg hover:border-[#64ffda] hover:text-[#64ffda]">Start New Search</button>
      </div>
      <div className="mt-8 p-4 bg-[#1a1a2e] rounded-lg border border-[#2a2a4e]"><p className="text-[#8892b0] text-sm"><span className="text-[#64ffda]">Tip:</span> Excel includes color-coded confidence: <span className="text-green-400">Verified</span> <span className="text-yellow-400">Likely</span> <span className="text-orange-400">Check</span> <span className="text-gray-400">None</span></p></div>
    </div>
  );
}
