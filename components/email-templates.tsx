'use client';

import { useState, useMemo } from 'react';
import {
  EMAIL_TEMPLATES,
  EmailTemplate,
  PERSONALIZATION_TOKENS,
  personalizeTemplate,
  getAvailableIndustries,
  detectIndustryFromQuery,
} from '@/lib/templates';

interface Business {
  name: string;
  email?: string | null;
  address?: string | null;
}

interface EmailTemplatesProps {
  searchQuery?: string;
  selectedBusiness?: Business;
  onClose?: () => void;
}

export function EmailTemplates({ searchQuery, selectedBusiness, onClose }: EmailTemplatesProps) {
  const detectedIndustry = searchQuery ? detectIndustryFromQuery(searchQuery) : 'general';
  const [selectedIndustry, setSelectedIndustry] = useState(detectedIndustry);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [copied, setCopied] = useState(false);
  const [yourName, setYourName] = useState('');
  const [yourCompany, setYourCompany] = useState('');
  const [yourService, setYourService] = useState('');

  const industries = getAvailableIndustries();

  const filteredTemplates = useMemo(() => {
    return EMAIL_TEMPLATES.filter(
      t => t.industry === selectedIndustry || t.industry === 'general'
    );
  }, [selectedIndustry]);

  // Extract city from address
  const businessCity = useMemo(() => {
    if (!selectedBusiness?.address) return '';
    const parts = selectedBusiness.address.split(',');
    if (parts.length >= 2) {
      return parts[parts.length - 2].trim();
    }
    return '';
  }, [selectedBusiness]);

  // Get personalized content
  const getPersonalizedContent = (content: string) => {
    const values: Record<string, string> = {
      '{business_name}': selectedBusiness?.name || '[Business Name]',
      '{first_name}': '[Owner Name]',
      '{city}': businessCity || '[City]',
      '{industry}': searchQuery || '[Industry]',
      '{your_name}': yourName || '[Your Name]',
      '{your_company}': yourCompany || '[Your Company]',
      '{your_service}': yourService || '[describe your service]',
    };
    return personalizeTemplate(content, values);
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#2a2a4e] flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Email Templates</h3>
        {onClose && (
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="p-4">
        {/* Industry Filter */}
        <div className="mb-4">
          <label className="block text-sm text-[#8892b0] mb-2">Industry</label>
          <select
            value={selectedIndustry}
            onChange={(e) => {
              setSelectedIndustry(e.target.value);
              setSelectedTemplate(null);
            }}
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-[#2a2a4e] rounded-lg text-white text-sm focus:outline-none focus:border-[#64ffda]"
          >
            {industries.map(ind => (
              <option key={ind.value} value={ind.value}>{ind.label}</option>
            ))}
          </select>
        </div>

        {/* Personalization Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 p-3 bg-[#0a0a0f] rounded-lg">
          <div>
            <label className="block text-xs text-[#8892b0] mb-1">Your Name</label>
            <input
              type="text"
              value={yourName}
              onChange={(e) => setYourName(e.target.value)}
              placeholder="John Doe"
              className="w-full px-2 py-1.5 bg-[#1a1a2e] border border-[#2a2a4e] rounded text-white text-sm placeholder-[#5a5a7e] focus:outline-none focus:border-[#64ffda]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#8892b0] mb-1">Your Company</label>
            <input
              type="text"
              value={yourCompany}
              onChange={(e) => setYourCompany(e.target.value)}
              placeholder="Acme Inc"
              className="w-full px-2 py-1.5 bg-[#1a1a2e] border border-[#2a2a4e] rounded text-white text-sm placeholder-[#5a5a7e] focus:outline-none focus:border-[#64ffda]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#8892b0] mb-1">Your Service</label>
            <input
              type="text"
              value={yourService}
              onChange={(e) => setYourService(e.target.value)}
              placeholder="increase revenue"
              className="w-full px-2 py-1.5 bg-[#1a1a2e] border border-[#2a2a4e] rounded text-white text-sm placeholder-[#5a5a7e] focus:outline-none focus:border-[#64ffda]"
            />
          </div>
        </div>

        {/* Template List */}
        {!selectedTemplate ? (
          <div className="space-y-2">
            {filteredTemplates.map(template => (
              <button
                key={template.id}
                onClick={() => setSelectedTemplate(template)}
                className="w-full p-3 bg-[#0a0a0f] border border-[#2a2a4e] rounded-lg text-left hover:border-[#64ffda] transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-medium text-sm">{template.name}</span>
                  <span className="text-xs text-[#5a5a7e]">{template.industry}</span>
                </div>
                <p className="text-xs text-[#8892b0] truncate">
                  Subject: {template.subject}
                </p>
                <p className="text-xs text-[#5a5a7e] mt-1">{template.bestFor}</p>
              </button>
            ))}
          </div>
        ) : (
          /* Template Preview */
          <div className="space-y-4">
            <button
              onClick={() => setSelectedTemplate(null)}
              className="text-[#64ffda] text-sm hover:underline flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to templates
            </button>

            {/* Subject */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-[#8892b0]">Subject Line</label>
                <button
                  onClick={() => handleCopy(getPersonalizedContent(selectedTemplate.subject))}
                  className="text-xs text-[#64ffda] hover:underline"
                >
                  Copy
                </button>
              </div>
              <div className="p-3 bg-[#0a0a0f] border border-[#2a2a4e] rounded-lg text-white text-sm">
                {getPersonalizedContent(selectedTemplate.subject)}
              </div>
            </div>

            {/* Body */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-[#8892b0]">Email Body</label>
                <button
                  onClick={() => handleCopy(getPersonalizedContent(selectedTemplate.body))}
                  className="text-xs text-[#64ffda] hover:underline"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="p-3 bg-[#0a0a0f] border border-[#2a2a4e] rounded-lg text-white text-sm whitespace-pre-wrap font-sans">
                {getPersonalizedContent(selectedTemplate.body)}
              </pre>
            </div>

            {/* Copy All Button */}
            <button
              onClick={() => handleCopy(
                `Subject: ${getPersonalizedContent(selectedTemplate.subject)}\n\n${getPersonalizedContent(selectedTemplate.body)}`
              )}
              className="w-full py-3 bg-[#64ffda] text-[#0a0a0f] font-medium rounded-lg hover:bg-[#7effea] transition-colors"
            >
              {copied ? 'Copied to clipboard!' : 'Copy Subject + Body'}
            </button>

            {/* Tips */}
            <div className="p-3 bg-[#0a0a0f] border border-[#2a2a4e] rounded-lg">
              <h4 className="text-sm font-medium text-[#64ffda] mb-2">Tips for this template</h4>
              <ul className="space-y-1">
                {selectedTemplate.tips.map((tip, i) => (
                  <li key={i} className="text-xs text-[#8892b0] flex items-start gap-2">
                    <span className="text-[#64ffda]">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>

            {/* Tokens Reference */}
            <details className="text-xs">
              <summary className="text-[#8892b0] cursor-pointer hover:text-white">
                Available personalization tokens
              </summary>
              <div className="mt-2 p-2 bg-[#0a0a0f] rounded-lg space-y-1">
                {Object.entries(PERSONALIZATION_TOKENS).map(([token, desc]) => (
                  <div key={token} className="flex gap-2">
                    <code className="text-[#64ffda]">{token}</code>
                    <span className="text-[#8892b0]">- {desc}</span>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
