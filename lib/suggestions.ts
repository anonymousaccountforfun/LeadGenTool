/**
 * Smart Search Suggestions Module
 *
 * Provides related searches, industry suggestions, and nearby locations
 * to help users discover more leads.
 */

// Industry relationship map - what people also search for
const INDUSTRY_RELATIONS: Record<string, string[]> = {
  // Healthcare
  'dentist': ['orthodontist', 'oral surgeon', 'dental hygienist', 'periodontist', 'cosmetic dentist'],
  'doctor': ['physician', 'family practice', 'urgent care', 'medical clinic', 'specialist'],
  'chiropractor': ['physical therapist', 'massage therapist', 'sports medicine', 'acupuncturist'],
  'therapist': ['counselor', 'psychologist', 'psychiatrist', 'life coach', 'mental health'],
  'veterinarian': ['pet clinic', 'animal hospital', 'pet grooming', 'pet boarding'],
  'optometrist': ['eye doctor', 'ophthalmologist', 'glasses store', 'vision center'],
  'pharmacy': ['drugstore', 'medical supply', 'compounding pharmacy'],

  // Home Services
  'plumber': ['electrician', 'HVAC', 'handyman', 'drain cleaning', 'water heater'],
  'electrician': ['plumber', 'HVAC', 'electrical contractor', 'lighting installer'],
  'roofer': ['gutter installer', 'siding contractor', 'general contractor', 'storm damage repair'],
  'landscaper': ['lawn care', 'tree service', 'garden center', 'irrigation', 'hardscaping'],
  'painter': ['interior designer', 'drywall contractor', 'wallpaper installer', 'cabinet refinisher'],
  'contractor': ['general contractor', 'home builder', 'remodeling', 'renovation'],
  'cleaning': ['house cleaner', 'maid service', 'janitorial', 'carpet cleaning', 'window cleaning'],

  // Professional Services
  'lawyer': ['attorney', 'law firm', 'legal services', 'paralegal', 'notary'],
  'accountant': ['CPA', 'tax preparer', 'bookkeeper', 'financial advisor', 'payroll service'],
  'realtor': ['real estate agent', 'property manager', 'mortgage broker', 'home inspector'],
  'insurance': ['insurance agent', 'insurance broker', 'life insurance', 'auto insurance'],
  'financial advisor': ['wealth manager', 'investment advisor', 'retirement planner', 'estate planner'],

  // Food & Dining
  'restaurant': ['cafe', 'bistro', 'diner', 'catering', 'food truck'],
  'pizza': ['italian restaurant', 'pizzeria', 'fast food', 'delivery restaurant'],
  'coffee': ['cafe', 'coffee shop', 'bakery', 'breakfast spot', 'tea shop'],
  'bakery': ['pastry shop', 'cake shop', 'donut shop', 'bread maker'],
  'catering': ['event planner', 'party supplies', 'wedding venue', 'banquet hall'],

  // Automotive
  'auto repair': ['mechanic', 'car service', 'tire shop', 'oil change', 'brake shop'],
  'car dealer': ['used cars', 'auto sales', 'car lot', 'motorcycle dealer'],
  'body shop': ['collision repair', 'auto body', 'paint shop', 'dent repair'],
  'towing': ['roadside assistance', 'auto transport', 'junk car removal'],

  // Beauty & Wellness
  'salon': ['hair salon', 'beauty salon', 'barbershop', 'nail salon', 'spa'],
  'spa': ['massage', 'wellness center', 'day spa', 'med spa', 'skin care'],
  'gym': ['fitness center', 'personal trainer', 'yoga studio', 'crossfit', 'pilates'],
  'barbershop': ['men\'s grooming', 'hair salon', 'shave parlor'],

  // Retail
  'florist': ['flower shop', 'gift shop', 'garden center', 'event decorator'],
  'jewelry': ['jeweler', 'watch repair', 'pawn shop', 'custom jewelry'],
  'clothing': ['boutique', 'fashion store', 'tailor', 'alterations'],

  // Technology & Business
  'IT services': ['computer repair', 'tech support', 'managed services', 'cybersecurity'],
  'marketing': ['advertising agency', 'digital marketing', 'SEO', 'social media', 'PR firm'],
  'web design': ['web developer', 'digital agency', 'app developer', 'graphic designer'],
  'printing': ['print shop', 'sign maker', 'promotional products', 'business cards'],
};

// US State to nearby states/cities mapping
const NEARBY_LOCATIONS: Record<string, { states: string[]; cities: string[] }> = {
  // Texas
  'austin': { states: ['Texas'], cities: ['San Antonio', 'Houston', 'Dallas', 'Round Rock', 'Cedar Park'] },
  'houston': { states: ['Texas'], cities: ['Austin', 'San Antonio', 'Dallas', 'Galveston', 'The Woodlands'] },
  'dallas': { states: ['Texas'], cities: ['Fort Worth', 'Austin', 'Houston', 'Plano', 'Arlington'] },
  'san antonio': { states: ['Texas'], cities: ['Austin', 'Houston', 'Dallas', 'New Braunfels', 'Boerne'] },

  // California
  'los angeles': { states: ['California'], cities: ['San Diego', 'San Francisco', 'Long Beach', 'Pasadena', 'Santa Monica'] },
  'san francisco': { states: ['California'], cities: ['Oakland', 'San Jose', 'Los Angeles', 'Berkeley', 'Palo Alto'] },
  'san diego': { states: ['California'], cities: ['Los Angeles', 'Irvine', 'Tijuana', 'La Jolla', 'Carlsbad'] },
  'san jose': { states: ['California'], cities: ['San Francisco', 'Oakland', 'Santa Clara', 'Fremont', 'Sunnyvale'] },

  // New York
  'new york': { states: ['New York', 'New Jersey'], cities: ['Brooklyn', 'Manhattan', 'Queens', 'Jersey City', 'Newark'] },
  'brooklyn': { states: ['New York'], cities: ['Manhattan', 'Queens', 'New York', 'Staten Island', 'Bronx'] },
  'buffalo': { states: ['New York'], cities: ['Rochester', 'Syracuse', 'Niagara Falls', 'Albany'] },

  // Florida
  'miami': { states: ['Florida'], cities: ['Fort Lauderdale', 'West Palm Beach', 'Orlando', 'Tampa', 'Boca Raton'] },
  'orlando': { states: ['Florida'], cities: ['Tampa', 'Miami', 'Jacksonville', 'Kissimmee', 'Winter Park'] },
  'tampa': { states: ['Florida'], cities: ['St. Petersburg', 'Orlando', 'Clearwater', 'Miami', 'Sarasota'] },

  // Illinois
  'chicago': { states: ['Illinois', 'Indiana'], cities: ['Evanston', 'Oak Park', 'Naperville', 'Aurora', 'Gary'] },

  // Arizona
  'phoenix': { states: ['Arizona'], cities: ['Scottsdale', 'Tempe', 'Mesa', 'Tucson', 'Chandler'] },

  // Washington
  'seattle': { states: ['Washington'], cities: ['Bellevue', 'Tacoma', 'Redmond', 'Everett', 'Portland'] },

  // Colorado
  'denver': { states: ['Colorado'], cities: ['Boulder', 'Aurora', 'Colorado Springs', 'Fort Collins', 'Lakewood'] },

  // Georgia
  'atlanta': { states: ['Georgia'], cities: ['Marietta', 'Decatur', 'Sandy Springs', 'Alpharetta', 'Savannah'] },

  // Massachusetts
  'boston': { states: ['Massachusetts'], cities: ['Cambridge', 'Somerville', 'Brookline', 'Worcester', 'Providence'] },

  // Pennsylvania
  'philadelphia': { states: ['Pennsylvania', 'New Jersey'], cities: ['Camden', 'Wilmington', 'King of Prussia', 'Pittsburgh', 'Trenton'] },

  // Nevada
  'las vegas': { states: ['Nevada'], cities: ['Henderson', 'North Las Vegas', 'Reno', 'Paradise', 'Boulder City'] },
};

// Popular/trending business categories
const TRENDING_SEARCHES = [
  'local restaurant',
  'coffee shop',
  'hair salon',
  'auto repair',
  'dentist',
  'real estate agent',
  'personal trainer',
  'photographer',
  'wedding planner',
  'home cleaning',
  'dog groomer',
  'massage therapist',
  'yoga studio',
  'accountant',
  'landscaping',
];

// Common business type prefixes for autocomplete
const BUSINESS_TYPES = [
  'restaurant', 'cafe', 'bar', 'bakery', 'pizza',
  'salon', 'spa', 'barbershop', 'gym', 'fitness',
  'dentist', 'doctor', 'chiropractor', 'therapist', 'veterinarian',
  'lawyer', 'accountant', 'realtor', 'insurance', 'financial',
  'plumber', 'electrician', 'roofer', 'landscaper', 'contractor',
  'auto repair', 'car dealer', 'towing', 'body shop',
  'florist', 'photographer', 'wedding', 'catering', 'event',
  'IT services', 'marketing', 'web design', 'printing',
  'cleaning', 'maid service', 'pest control', 'locksmith',
  'daycare', 'tutoring', 'music lessons', 'dance studio',
  'pet grooming', 'pet store', 'kennel', 'dog walker',
  'moving company', 'storage', 'junk removal',
  'jewelry', 'clothing', 'boutique', 'tailor',
];

export interface SearchSuggestion {
  type: 'related' | 'location' | 'trending' | 'autocomplete';
  text: string;
  query?: string;
  location?: string;
  reason?: string;
}

/**
 * Get related industry suggestions based on query
 */
export function getRelatedIndustries(query: string): SearchSuggestion[] {
  const normalizedQuery = query.toLowerCase().trim();

  // Find exact or partial matches in the relations map
  for (const [key, related] of Object.entries(INDUSTRY_RELATIONS)) {
    if (normalizedQuery.includes(key) || key.includes(normalizedQuery)) {
      return related.slice(0, 5).map(industry => ({
        type: 'related',
        text: industry,
        query: industry,
        reason: `Related to "${key}"`,
      }));
    }
  }

  // Check if query is in any related list
  for (const [key, related] of Object.entries(INDUSTRY_RELATIONS)) {
    if (related.some(r => r.toLowerCase().includes(normalizedQuery))) {
      return [key, ...related.filter(r => r.toLowerCase() !== normalizedQuery)]
        .slice(0, 5)
        .map(industry => ({
          type: 'related',
          text: industry,
          query: industry,
          reason: 'People also search for',
        }));
    }
  }

  return [];
}

/**
 * Get nearby location suggestions
 */
export function getNearbyLocations(location: string): SearchSuggestion[] {
  const normalizedLocation = location.toLowerCase().trim();

  // Check for city match
  for (const [city, nearby] of Object.entries(NEARBY_LOCATIONS)) {
    if (normalizedLocation.includes(city) || city.includes(normalizedLocation)) {
      return nearby.cities.slice(0, 5).map(nearbyCity => ({
        type: 'location',
        text: nearbyCity,
        location: nearbyCity,
        reason: `Near ${city.charAt(0).toUpperCase() + city.slice(1)}`,
      }));
    }
  }

  return [];
}

/**
 * Get trending searches
 */
export function getTrendingSearches(limit: number = 5): SearchSuggestion[] {
  // Shuffle and return trending searches
  const shuffled = [...TRENDING_SEARCHES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, limit).map(search => ({
    type: 'trending',
    text: search,
    query: search,
    reason: 'Trending',
  }));
}

/**
 * Get autocomplete suggestions for business type
 */
export function getAutocompleteSuggestions(partial: string, limit: number = 8): SearchSuggestion[] {
  if (!partial || partial.length < 2) return [];

  const normalizedPartial = partial.toLowerCase().trim();

  const matches = BUSINESS_TYPES
    .filter(type => type.toLowerCase().startsWith(normalizedPartial))
    .slice(0, limit)
    .map(type => ({
      type: 'autocomplete' as const,
      text: type,
      query: type,
    }));

  // If no prefix matches, try contains
  if (matches.length < 3) {
    const containsMatches = BUSINESS_TYPES
      .filter(type =>
        type.toLowerCase().includes(normalizedPartial) &&
        !type.toLowerCase().startsWith(normalizedPartial)
      )
      .slice(0, limit - matches.length)
      .map(type => ({
        type: 'autocomplete' as const,
        text: type,
        query: type,
      }));
    matches.push(...containsMatches);
  }

  return matches;
}

/**
 * Get all suggestions for a search
 */
export interface SuggestionsResult {
  relatedIndustries: SearchSuggestion[];
  nearbyLocations: SearchSuggestion[];
  trending: SearchSuggestion[];
  autocomplete: SearchSuggestion[];
}

export function getAllSuggestions(query: string, location?: string): SuggestionsResult {
  return {
    relatedIndustries: query ? getRelatedIndustries(query) : [],
    nearbyLocations: location ? getNearbyLocations(location) : [],
    trending: getTrendingSearches(5),
    autocomplete: query ? getAutocompleteSuggestions(query) : [],
  };
}

/**
 * Get suggestions specifically for "People also search for" after a search
 */
export function getPostSearchSuggestions(query: string, location?: string): SearchSuggestion[] {
  const suggestions: SearchSuggestion[] = [];

  // Add related industries
  const related = getRelatedIndustries(query);
  suggestions.push(...related.slice(0, 3));

  // Add nearby locations if location was provided
  if (location) {
    const nearby = getNearbyLocations(location);
    suggestions.push(...nearby.slice(0, 2));
  }

  return suggestions;
}
