'use client';
import { useState } from 'react';

const EXAMPLES = [
  { label: 'Med Spa', query: 'med spa', location: 'Miami', state: 'FL', locationType: 'city' as const },
  { label: 'Restaurants', query: 'restaurant', location: 'Austin', state: 'TX', locationType: 'city' as const },
  { label: 'Hair Salons', query: 'hair salon', location: 'Nassau County', state: 'NY', locationType: 'county' as const },
  { label: 'Fitness Studios', query: 'fitness studio', location: 'Denver', state: 'CO', locationType: 'radius' as const, radius: 25 },
];

export const LOCATION_TYPES = [
  { value: 'city', label: 'City' },
  { value: 'county', label: 'County' },
  { value: 'radius', label: 'Radius from City' },
];

export const RADIUS_OPTIONS = [
  { value: 5, label: '5 miles' },
  { value: 10, label: '10 miles' },
  { value: 15, label: '15 miles' },
  { value: 20, label: '20 miles' },
  { value: 25, label: '25 miles' },
  { value: 50, label: '50 miles' },
];

// B2C-focused industry categories
export const INDUSTRY_CATEGORIES = [
  { value: '', label: 'All Industries' },
  { value: 'restaurant_food', label: 'Restaurants & Food Service' },
  { value: 'beauty_wellness', label: 'Beauty & Wellness (Salons, Spas, Gyms)' },
  { value: 'retail', label: 'Retail & Shopping' },
  { value: 'home_services', label: 'Home Services (Plumbers, Contractors)' },
  { value: 'medical', label: 'Medical & Healthcare' },
  { value: 'automotive', label: 'Automotive Services' },
  { value: 'professional_services', label: 'Professional Services (Legal, Accounting)' },
  { value: 'entertainment', label: 'Entertainment & Recreation' },
  { value: 'education', label: 'Education & Tutoring' },
  { value: 'pet_services', label: 'Pet Services' },
];

export const US_STATES = [
  { value: '', label: 'All States' },
  { value: 'AL', label: 'Alabama' }, { value: 'AK', label: 'Alaska' }, { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' }, { value: 'CA', label: 'California' }, { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' }, { value: 'DE', label: 'Delaware' }, { value: 'DC', label: 'Washington DC' },
  { value: 'FL', label: 'Florida' }, { value: 'GA', label: 'Georgia' }, { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' }, { value: 'IL', label: 'Illinois' }, { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' }, { value: 'KS', label: 'Kansas' }, { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' }, { value: 'ME', label: 'Maine' }, { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' }, { value: 'MI', label: 'Michigan' }, { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' }, { value: 'MO', label: 'Missouri' }, { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' }, { value: 'NV', label: 'Nevada' }, { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' }, { value: 'NM', label: 'New Mexico' }, { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' }, { value: 'ND', label: 'North Dakota' }, { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' }, { value: 'OR', label: 'Oregon' }, { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' }, { value: 'SC', label: 'South Carolina' }, { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' }, { value: 'TX', label: 'Texas' }, { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' }, { value: 'VA', label: 'Virginia' }, { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' }, { value: 'WI', label: 'Wisconsin' }, { value: 'WY', label: 'Wyoming' },
];

export const COMPANY_SIZE_OPTIONS = [
  { value: '', label: 'Any Size', min: null, max: null },
  { value: '1-10', label: '1-10 employees (Small)', min: 1, max: 10 },
  { value: '11-50', label: '11-50 employees (Medium)', min: 11, max: 50 },
  { value: '51-200', label: '51-200 employees (Large)', min: 51, max: 200 },
  { value: '201-500', label: '201-500 employees (Enterprise)', min: 201, max: 500 },
  { value: '500+', label: '500+ employees (Corporate)', min: 500, max: null },
];

export type LocationType = 'city' | 'county' | 'radius';

export interface SearchFilters {
  query: string;
  location: string;
  count: number;
  industryCategory: string;
  targetState: string;
  companySizeMin: number | null;
  companySizeMax: number | null;
  b2cOnly: boolean;
  locationType: LocationType;
  radius: number | null;
}

interface LeadFormProps {
  onSubmit: (filters: SearchFilters) => void;
  isLoading: boolean;
}

export function LeadForm({ onSubmit, isLoading }: LeadFormProps) {
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [count, setCount] = useState(25);
  const [industryCategory, setIndustryCategory] = useState('');
  const [targetState, setTargetState] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [b2cOnly, setB2cOnly] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [locationType, setLocationType] = useState<LocationType>('city');
  const [radius, setRadius] = useState(25);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    const sizeOption = COMPANY_SIZE_OPTIONS.find(opt => opt.value === companySize);

    // Build the location string based on location type
    let locationString = location.trim();
    if (locationType === 'county' && locationString && !locationString.toLowerCase().includes('county')) {
      locationString = `${locationString} County`;
    }

    onSubmit({
      query: query.trim(),
      location: locationString,
      count,
      industryCategory,
      targetState,
      companySizeMin: sizeOption?.min ?? null,
      companySizeMax: sizeOption?.max ?? null,
      b2cOnly,
      locationType,
      radius: locationType === 'radius' ? radius : null,
    });
  };

  const handleExampleClick = (ex: typeof EXAMPLES[0]) => {
    setQuery(ex.query);
    setLocation(ex.location);
    if (ex.state) setTargetState(ex.state);
    if (ex.locationType) setLocationType(ex.locationType);
    if ('radius' in ex && ex.radius) setRadius(ex.radius);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold text-white mb-3">Lead <span className="text-[#64ffda]">Generator</span></h1>
        <p className="text-[#8892b0] text-lg">Find B2C business leads across the US</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-[#ccd6f6] mb-2">What type of business?</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g., restaurant, hair salon, gym, dentist..."
            className="w-full px-4 py-3 bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg text-white placeholder-[#5a5a7e] focus:outline-none focus:border-[#64ffda]"
            required
            disabled={isLoading}
          />
        </div>

        {/* Location Section */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#ccd6f6] mb-2">State</label>
              <select
                value={targetState}
                onChange={(e) => setTargetState(e.target.value)}
                className="w-full px-4 py-3 bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg text-white focus:outline-none focus:border-[#64ffda]"
                disabled={isLoading}
              >
                {US_STATES.map(state => (
                  <option key={state.value} value={state.value}>{state.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#ccd6f6] mb-2">Search by</label>
              <select
                value={locationType}
                onChange={(e) => setLocationType(e.target.value as LocationType)}
                className="w-full px-4 py-3 bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg text-white focus:outline-none focus:border-[#64ffda]"
                disabled={isLoading}
              >
                {LOCATION_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Dynamic location input based on type */}
          {locationType === 'city' && (
            <div>
              <label className="block text-sm font-medium text-[#ccd6f6] mb-2">
                City <span className="text-[#8892b0] font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Austin, Miami, Hicksville..."
                className="w-full px-4 py-3 bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg text-white placeholder-[#5a5a7e] focus:outline-none focus:border-[#64ffda]"
                disabled={isLoading}
              />
            </div>
          )}

          {locationType === 'county' && (
            <div>
              <label className="block text-sm font-medium text-[#ccd6f6] mb-2">County Name</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Nassau, Orange, Cook..."
                className="w-full px-4 py-3 bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg text-white placeholder-[#5a5a7e] focus:outline-none focus:border-[#64ffda]"
                disabled={isLoading}
              />
              <p className="text-xs text-[#8892b0] mt-1">We&apos;ll search &quot;{location || 'County'} County, {targetState || 'State'}&quot;</p>
            </div>
          )}

          {locationType === 'radius' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#ccd6f6] mb-2">Center City</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., Hicksville, Garden City..."
                  className="w-full px-4 py-3 bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg text-white placeholder-[#5a5a7e] focus:outline-none focus:border-[#64ffda]"
                  disabled={isLoading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#ccd6f6] mb-2">Search Radius</label>
                <select
                  value={radius}
                  onChange={(e) => setRadius(parseInt(e.target.value))}
                  className="w-full px-4 py-3 bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg text-white focus:outline-none focus:border-[#64ffda]"
                  disabled={isLoading}
                >
                  {RADIUS_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <p className="col-span-2 text-xs text-[#8892b0]">
                We&apos;ll search within {radius} miles of {location || 'your city'}, {targetState || 'State'}
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-[#ccd6f6] mb-2">Number of leads</label>
          <select
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value))}
            className="w-full px-4 py-3 bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg text-white focus:outline-none focus:border-[#64ffda]"
            disabled={isLoading}
          >
            <option value={25}>25 leads</option>
            <option value={50}>50 leads</option>
            <option value={100}>100 leads</option>
          </select>
        </div>

        {/* Advanced Filters Toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-[#64ffda] text-sm hover:underline flex items-center gap-2"
          disabled={isLoading}
        >
          <span>{showAdvanced ? '▼' : '▶'}</span>
          Advanced Filters
        </button>

        {showAdvanced && (
          <div className="space-y-4 p-4 bg-[#12121a] rounded-lg border border-[#2a2a4e]">
            <div>
              <label className="block text-sm font-medium text-[#ccd6f6] mb-2">Industry Category</label>
              <select
                value={industryCategory}
                onChange={(e) => setIndustryCategory(e.target.value)}
                className="w-full px-4 py-3 bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg text-white focus:outline-none focus:border-[#64ffda]"
                disabled={isLoading}
              >
                {INDUSTRY_CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#ccd6f6] mb-2">Company Size</label>
              <select
                value={companySize}
                onChange={(e) => setCompanySize(e.target.value)}
                className="w-full px-4 py-3 bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg text-white focus:outline-none focus:border-[#64ffda]"
                disabled={isLoading}
              >
                {COMPANY_SIZE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="b2cOnly"
                checked={b2cOnly}
                onChange={(e) => setB2cOnly(e.target.checked)}
                className="w-4 h-4 rounded border-[#2a2a4e] bg-[#1a1a2e] text-[#64ffda] focus:ring-[#64ffda]"
                disabled={isLoading}
              />
              <label htmlFor="b2cOnly" className="text-sm text-[#ccd6f6]">
                Consumer businesses only (exclude B2B)
              </label>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="w-full py-4 bg-[#64ffda] text-[#0a0a0f] font-semibold rounded-lg hover:bg-[#7effea] disabled:opacity-50 text-lg"
        >
          {isLoading ? 'Finding Leads...' : 'Find Leads'}
        </button>
      </form>

      <div className="mt-8">
        <p className="text-[#8892b0] text-sm mb-3 text-center">Try an example:</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              onClick={() => handleExampleClick(ex)}
              disabled={isLoading}
              className="px-3 py-1.5 bg-[#1a1a2e] border border-[#2a2a4e] rounded-full text-[#8892b0] text-sm hover:border-[#64ffda] hover:text-[#64ffda] disabled:opacity-50"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
