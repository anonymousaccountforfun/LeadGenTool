/**
 * Source Prioritization Module
 * Intelligently selects and prioritizes data sources based on query type
 */

export type DataSource =
  | 'google_maps'
  | 'google_serp'
  | 'bing_places'
  | 'yelp'
  | 'yellow_pages'
  | 'manta'
  | 'bbb'
  | 'chamber_of_commerce'
  | 'healthgrades'
  | 'zocdoc'
  | 'angi'
  | 'homeadvisor'
  | 'thumbtack'
  | 'houzz'
  | 'tripadvisor'
  | 'avvo'
  | 'google_search'
  | 'instagram';

export type QueryCategory =
  | 'medical'
  | 'home_services'
  | 'restaurant_food'
  | 'retail'
  | 'professional_services'
  | 'beauty_wellness'
  | 'automotive'
  | 'online_brand'
  | 'general_local'
  | 'general_online'
  | 'entertainment'
  | 'education'
  | 'pet_services';

// Filter options from UI
export interface SourceFilterOptions {
  industryCategory?: string | null;
  targetState?: string | null;
  companySizeMin?: number | null;
  companySizeMax?: number | null;
}

export type SourceType = 'api' | 'scrape';

export interface SourceConfig {
  source: DataSource;
  priority: number; // 1 = highest priority, run first
  parallel: boolean; // Can run in parallel with same priority level
  minResults?: number; // Skip if we already have this many results
  type: SourceType; // Whether this source uses an API or scraping
}

// Category detection patterns
const CATEGORY_PATTERNS: Record<QueryCategory, string[]> = {
  medical: [
    'doctor', 'dentist', 'physician', 'surgeon', 'dermatologist', 'orthodontist',
    'pediatrician', 'therapist', 'psychiatrist', 'cardiologist', 'optometrist',
    'chiropractor', 'physical therapy', 'medical', 'clinic', 'healthcare', 'dental',
    'hospital', 'urgent care', 'pharmacy', 'veterinarian', 'vet clinic', 'psychologist',
    'counselor', 'ophthalmologist', 'podiatrist', 'neurologist', 'oncologist'
  ],
  home_services: [
    'plumber', 'electrician', 'contractor', 'roofer', 'painter', 'landscaper',
    'hvac', 'handyman', 'remodeling', 'renovation', 'flooring', 'carpentry',
    'pest control', 'cleaning', 'mover', 'garage door', 'window', 'siding',
    'deck', 'fence', 'drywall', 'insulation', 'solar', 'pool', 'septic',
    'plumbing', 'electrical', 'roofing', 'painting', 'lawn care', 'tree service',
    'locksmith', 'appliance repair', 'foundation', 'waterproofing', 'gutter'
  ],
  restaurant_food: [
    'restaurant', 'cafe', 'coffee', 'bakery', 'pizza', 'sushi', 'italian',
    'mexican', 'chinese', 'thai', 'indian', 'bar', 'pub', 'brewery', 'winery',
    'catering', 'food truck', 'deli', 'bistro', 'steakhouse', 'seafood',
    'brunch', 'breakfast', 'lunch', 'dinner', 'takeout', 'delivery'
  ],
  retail: [
    'store', 'shop', 'boutique', 'outlet', 'mall', 'retail', 'clothing',
    'jewelry', 'furniture', 'electronics', 'hardware', 'grocery', 'supermarket',
    'pet store', 'toy store', 'bookstore', 'florist', 'gift shop', 'antique'
  ],
  professional_services: [
    'lawyer', 'attorney', 'accountant', 'cpa', 'financial advisor', 'insurance',
    'real estate', 'realtor', 'architect', 'engineer', 'consultant', 'marketing',
    'advertising', 'pr agency', 'law firm', 'tax', 'notary', 'mortgage',
    'investment', 'bank', 'credit union', 'wealth management'
  ],
  beauty_wellness: [
    'salon', 'spa', 'barber', 'nail', 'massage', 'yoga', 'gym', 'fitness',
    'pilates', 'crossfit', 'personal trainer', 'tattoo', 'piercing',
    'waxing', 'facial', 'skincare', 'aesthetician', 'medspa', 'wellness',
    'acupuncture', 'meditation', 'hair stylist', 'beauty', 'cosmetic'
  ],
  automotive: [
    'mechanic', 'auto repair', 'car dealer', 'dealership', 'auto body',
    'tire', 'oil change', 'car wash', 'detailing', 'towing', 'transmission',
    'brake', 'muffler', 'alignment', 'auto parts', 'motorcycle', 'rv'
  ],
  online_brand: [
    'dtc', 'brand', 'subscription', 'startup', 'maker', 'artisan', 'ecommerce',
    'e-commerce', 'online store', 'digital', 'saas', 'app', 'software',
    'tech company', 'marketplace'
  ],
  entertainment: [
    'movie', 'theater', 'theatre', 'cinema', 'bowling', 'arcade', 'amusement',
    'entertainment', 'nightclub', 'club', 'casino', 'concert', 'venue',
    'escape room', 'laser tag', 'mini golf', 'trampoline', 'zoo', 'aquarium',
    'museum', 'gallery', 'park', 'recreation'
  ],
  education: [
    'school', 'academy', 'tutoring', 'tutor', 'learning', 'daycare', 'preschool',
    'kindergarten', 'education', 'training', 'driving school', 'music lessons',
    'dance school', 'art class', 'martial arts', 'karate', 'swimming lessons'
  ],
  pet_services: [
    'pet', 'dog', 'cat', 'grooming', 'pet groomer', 'dog walker', 'pet sitter',
    'kennel', 'boarding', 'pet store', 'pet shop', 'veterinary', 'vet',
    'animal hospital', 'pet daycare', 'dog training', 'pet supplies'
  ],
  general_local: [],
  general_online: []
};

// Source configurations by category
// Note: 'api' type = official API (fast, reliable), 'scrape' type = web scraping (slower, may break)
const SOURCE_PRIORITIES: Record<QueryCategory, SourceConfig[]> = {
  medical: [
    { source: 'google_maps', priority: 1, parallel: true, type: 'scrape' },
    { source: 'google_serp', priority: 1, parallel: true, type: 'scrape' },
    { source: 'bing_places', priority: 1, parallel: true, type: 'scrape' },
    { source: 'healthgrades', priority: 1, parallel: true, type: 'scrape' },
    { source: 'zocdoc', priority: 1, parallel: true, type: 'scrape' },
    { source: 'yelp', priority: 2, parallel: true, minResults: 10, type: 'scrape' },
    { source: 'manta', priority: 2, parallel: true, minResults: 15, type: 'scrape' },
    { source: 'bbb', priority: 3, parallel: false, minResults: 20, type: 'scrape' },
  ],
  home_services: [
    { source: 'google_maps', priority: 1, parallel: true, type: 'scrape' },
    { source: 'google_serp', priority: 1, parallel: true, type: 'scrape' },
    { source: 'bing_places', priority: 1, parallel: true, type: 'scrape' },
    { source: 'angi', priority: 1, parallel: true, type: 'scrape' },
    { source: 'homeadvisor', priority: 1, parallel: true, type: 'scrape' },
    { source: 'thumbtack', priority: 1, parallel: true, type: 'scrape' },
    { source: 'yelp', priority: 1, parallel: true, type: 'scrape' },
    { source: 'houzz', priority: 2, parallel: true, minResults: 10, type: 'scrape' },
    { source: 'yellow_pages', priority: 2, parallel: true, minResults: 15, type: 'scrape' },
    { source: 'manta', priority: 2, parallel: true, minResults: 15, type: 'scrape' },
    { source: 'bbb', priority: 2, parallel: true, minResults: 15, type: 'scrape' },
    { source: 'chamber_of_commerce', priority: 3, parallel: false, minResults: 25, type: 'scrape' },
  ],
  restaurant_food: [
    { source: 'google_maps', priority: 1, parallel: true, type: 'scrape' },
    { source: 'google_serp', priority: 1, parallel: true, type: 'scrape' },
    { source: 'bing_places', priority: 1, parallel: true, type: 'scrape' },
    { source: 'yelp', priority: 1, parallel: true, type: 'scrape' },
    { source: 'tripadvisor', priority: 1, parallel: true, type: 'scrape' },
    { source: 'yellow_pages', priority: 2, parallel: true, minResults: 15, type: 'scrape' },
    { source: 'manta', priority: 2, parallel: true, minResults: 20, type: 'scrape' },
  ],
  retail: [
    { source: 'google_maps', priority: 1, parallel: true, type: 'scrape' },
    { source: 'google_serp', priority: 1, parallel: true, type: 'scrape' },
    { source: 'bing_places', priority: 1, parallel: true, type: 'scrape' },
    { source: 'yelp', priority: 1, parallel: true, type: 'scrape' },
    { source: 'yellow_pages', priority: 2, parallel: true, minResults: 15, type: 'scrape' },
    { source: 'manta', priority: 2, parallel: true, minResults: 15, type: 'scrape' },
    { source: 'chamber_of_commerce', priority: 3, parallel: false, minResults: 25, type: 'scrape' },
  ],
  professional_services: [
    { source: 'google_maps', priority: 1, parallel: true, type: 'scrape' },
    { source: 'google_serp', priority: 1, parallel: true, type: 'scrape' },
    { source: 'bing_places', priority: 1, parallel: true, type: 'scrape' },
    { source: 'yelp', priority: 1, parallel: true, type: 'scrape' },
    { source: 'bbb', priority: 1, parallel: true, type: 'scrape' },
    { source: 'avvo', priority: 1, parallel: true, type: 'scrape' },
    { source: 'yellow_pages', priority: 2, parallel: true, minResults: 15, type: 'scrape' },
    { source: 'manta', priority: 2, parallel: true, minResults: 15, type: 'scrape' },
    { source: 'chamber_of_commerce', priority: 2, parallel: true, minResults: 20, type: 'scrape' },
  ],
  beauty_wellness: [
    { source: 'google_maps', priority: 1, parallel: true, type: 'scrape' },
    { source: 'google_serp', priority: 1, parallel: true, type: 'scrape' },
    { source: 'bing_places', priority: 1, parallel: true, type: 'scrape' },
    { source: 'yelp', priority: 1, parallel: true, type: 'scrape' },
    { source: 'thumbtack', priority: 1, parallel: true, type: 'scrape' },
    { source: 'yellow_pages', priority: 2, parallel: true, minResults: 15, type: 'scrape' },
    { source: 'manta', priority: 2, parallel: true, minResults: 20, type: 'scrape' },
  ],
  automotive: [
    { source: 'google_maps', priority: 1, parallel: true, type: 'scrape' },
    { source: 'google_serp', priority: 1, parallel: true, type: 'scrape' },
    { source: 'bing_places', priority: 1, parallel: true, type: 'scrape' },
    { source: 'yelp', priority: 1, parallel: true, type: 'scrape' },
    { source: 'yellow_pages', priority: 2, parallel: true, minResults: 15, type: 'scrape' },
    { source: 'manta', priority: 2, parallel: true, minResults: 15, type: 'scrape' },
    { source: 'bbb', priority: 2, parallel: true, minResults: 15, type: 'scrape' },
  ],
  online_brand: [
    { source: 'google_search', priority: 1, parallel: true, type: 'scrape' },
    { source: 'instagram', priority: 1, parallel: true, type: 'scrape' },
  ],
  general_local: [
    { source: 'google_maps', priority: 1, parallel: true, type: 'scrape' },
    { source: 'google_serp', priority: 1, parallel: true, type: 'scrape' },
    { source: 'bing_places', priority: 1, parallel: true, type: 'scrape' },
    { source: 'yelp', priority: 1, parallel: true, type: 'scrape' },
    { source: 'thumbtack', priority: 2, parallel: true, minResults: 10, type: 'scrape' },
    { source: 'yellow_pages', priority: 2, parallel: true, minResults: 15, type: 'scrape' },
    { source: 'manta', priority: 2, parallel: true, minResults: 15, type: 'scrape' },
    { source: 'bbb', priority: 2, parallel: true, minResults: 15, type: 'scrape' },
    { source: 'chamber_of_commerce', priority: 3, parallel: false, minResults: 25, type: 'scrape' },
  ],
  general_online: [
    { source: 'google_search', priority: 1, parallel: true, type: 'scrape' },
    { source: 'instagram', priority: 2, parallel: false, minResults: 15, type: 'scrape' },
  ],
  entertainment: [
    { source: 'google_maps', priority: 1, parallel: true, type: 'scrape' },
    { source: 'google_serp', priority: 1, parallel: true, type: 'scrape' },
    { source: 'bing_places', priority: 1, parallel: true, type: 'scrape' },
    { source: 'yelp', priority: 1, parallel: true, type: 'scrape' },
    { source: 'tripadvisor', priority: 1, parallel: true, type: 'scrape' },
    { source: 'yellow_pages', priority: 2, parallel: true, minResults: 15, type: 'scrape' },
    { source: 'manta', priority: 2, parallel: true, minResults: 20, type: 'scrape' },
  ],
  education: [
    { source: 'google_maps', priority: 1, parallel: true, type: 'scrape' },
    { source: 'google_serp', priority: 1, parallel: true, type: 'scrape' },
    { source: 'bing_places', priority: 1, parallel: true, type: 'scrape' },
    { source: 'yelp', priority: 1, parallel: true, type: 'scrape' },
    { source: 'yellow_pages', priority: 2, parallel: true, minResults: 15, type: 'scrape' },
    { source: 'manta', priority: 2, parallel: true, minResults: 15, type: 'scrape' },
    { source: 'bbb', priority: 2, parallel: true, minResults: 20, type: 'scrape' },
  ],
  pet_services: [
    { source: 'google_maps', priority: 1, parallel: true, type: 'scrape' },
    { source: 'google_serp', priority: 1, parallel: true, type: 'scrape' },
    { source: 'bing_places', priority: 1, parallel: true, type: 'scrape' },
    { source: 'yelp', priority: 1, parallel: true, type: 'scrape' },
    { source: 'thumbtack', priority: 2, parallel: true, minResults: 10, type: 'scrape' },
    { source: 'yellow_pages', priority: 2, parallel: true, minResults: 15, type: 'scrape' },
    { source: 'manta', priority: 2, parallel: true, minResults: 20, type: 'scrape' },
    { source: 'bbb', priority: 3, parallel: false, minResults: 25, type: 'scrape' },
  ],
};

/**
 * Detect the category of a query
 */
export function detectQueryCategory(query: string, hasLocation: boolean): QueryCategory {
  const q = query.toLowerCase();

  // Check each category's patterns
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS) as [QueryCategory, string[]][]) {
    if (patterns.length === 0) continue; // Skip general categories
    if (patterns.some(pattern => q.includes(pattern))) {
      return category;
    }
  }

  // Default based on location
  return hasLocation ? 'general_local' : 'general_online';
}

/**
 * Get prioritized sources for a query
 */
export function getPrioritizedSources(query: string, hasLocation: boolean): SourceConfig[] {
  const category = detectQueryCategory(query, hasLocation);
  return SOURCE_PRIORITIES[category] || SOURCE_PRIORITIES.general_local;
}

/**
 * Get prioritized sources using filter options from UI
 * This allows the UI to override auto-detection with explicit industry selection
 */
export function getPrioritizedSourcesWithFilters(
  query: string,
  hasLocation: boolean,
  filters?: SourceFilterOptions
): SourceConfig[] {
  // If industry category is explicitly set in filters, use it
  if (filters?.industryCategory && filters.industryCategory in SOURCE_PRIORITIES) {
    const category = filters.industryCategory as QueryCategory;
    console.log(`[SourcePrioritizer] Using UI-selected category: ${category}`);
    return SOURCE_PRIORITIES[category];
  }

  // Otherwise, auto-detect from query
  const category = detectQueryCategory(query, hasLocation);
  console.log(`[SourcePrioritizer] Auto-detected category: ${category}`);
  return SOURCE_PRIORITIES[category] || SOURCE_PRIORITIES.general_local;
}

/**
 * Map UI industry category values to QueryCategory
 */
export function mapIndustryCategoryToQuery(uiCategory: string | null | undefined): QueryCategory | null {
  if (!uiCategory) return null;

  const mapping: Record<string, QueryCategory> = {
    'restaurant_food': 'restaurant_food',
    'beauty_wellness': 'beauty_wellness',
    'retail': 'retail',
    'home_services': 'home_services',
    'medical': 'medical',
    'automotive': 'automotive',
    'professional_services': 'professional_services',
    'entertainment': 'entertainment',
    'education': 'education',
    'pet_services': 'pet_services',
  };

  return mapping[uiCategory] || null;
}

/**
 * Group sources by priority level for parallel execution
 */
export function groupSourcesByPriority(sources: SourceConfig[]): Map<number, SourceConfig[]> {
  const groups = new Map<number, SourceConfig[]>();

  for (const source of sources) {
    const existing = groups.get(source.priority) || [];
    existing.push(source);
    groups.set(source.priority, existing);
  }

  return groups;
}

/**
 * Filter sources based on current result count
 */
export function filterSourcesByResultCount(
  sources: SourceConfig[],
  currentResultCount: number
): SourceConfig[] {
  return sources.filter(s => !s.minResults || currentResultCount < s.minResults);
}

/**
 * Get a human-readable description of the query category
 */
export function getCategoryDescription(category: QueryCategory): string {
  const descriptions: Record<QueryCategory, string> = {
    medical: 'Medical & Healthcare',
    home_services: 'Home Services',
    restaurant_food: 'Restaurants & Food',
    retail: 'Retail & Shopping',
    professional_services: 'Professional Services',
    beauty_wellness: 'Beauty & Wellness',
    automotive: 'Automotive',
    online_brand: 'Online Brands',
    general_local: 'Local Businesses',
    general_online: 'Online Businesses',
    entertainment: 'Entertainment & Recreation',
    education: 'Education & Tutoring',
    pet_services: 'Pet Services',
  };
  return descriptions[category];
}

/**
 * Check if a source uses an API (fast, reliable) or scraping (slower)
 */
export function isApiSource(source: DataSource): boolean {
  // These sources have official API integrations in api-fallback.ts
  const apiSources: DataSource[] = [];
  // Note: google_maps scraping is different from google_places_api
  // All current scrapers use web scraping, APIs are handled separately
  return apiSources.includes(source);
}

/**
 * Get the type of a source (api or scrape)
 */
export function getSourceType(source: DataSource): SourceType {
  // Check all category configs to find the source type
  for (const configs of Object.values(SOURCE_PRIORITIES)) {
    const config = configs.find(c => c.source === source);
    if (config) return config.type;
  }
  return 'scrape'; // Default to scrape if not found
}

/**
 * Get estimated scrape time for a set of sources
 */
export function estimateScrapeTime(sources: SourceConfig[], targetCount: number): number {
  // Rough estimates in seconds per source
  const timePerSource: Record<DataSource, number> = {
    google_maps: 15,
    google_serp: 10,
    bing_places: 10,
    yelp: 12,
    yellow_pages: 10,
    manta: 12,
    bbb: 12,
    chamber_of_commerce: 15,
    healthgrades: 12,
    zocdoc: 12,
    angi: 12,
    homeadvisor: 12,
    thumbtack: 12,
    houzz: 12,
    tripadvisor: 12,
    avvo: 10,
    google_search: 8,
    instagram: 10,
  };

  // Group by priority and calculate parallel execution time
  const groups = groupSourcesByPriority(sources);
  let totalTime = 0;

  for (const [, group] of groups) {
    // For parallel sources, take the max time
    // For sequential, sum them
    const parallelSources = group.filter(s => s.parallel);
    const sequentialSources = group.filter(s => !s.parallel);

    if (parallelSources.length > 0) {
      const maxParallelTime = Math.max(...parallelSources.map(s => timePerSource[s.source]));
      totalTime += maxParallelTime;
    }

    for (const s of sequentialSources) {
      totalTime += timePerSource[s.source];
    }
  }

  // Adjust for target count (more results = more time)
  const countMultiplier = Math.min(2, targetCount / 25);
  return Math.round(totalTime * countMultiplier);
}
