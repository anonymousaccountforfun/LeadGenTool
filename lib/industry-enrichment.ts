/**
 * Industry-Specific Enrichment Module
 *
 * Adds specialized data fields based on industry type:
 * - Restaurants: menu link, cuisine type, price range, reservation link
 * - Contractors: service area, license number, specialties
 * - Medical: accepting new patients, insurance accepted, specialties
 * - Salons: booking link, services offered, price range
 */

// ============ Types ============

export type IndustryType =
  | 'restaurant'
  | 'contractor'
  | 'medical'
  | 'salon'
  | 'retail'
  | 'professional_services'
  | 'automotive'
  | 'fitness'
  | 'hospitality'
  | 'other';

export interface RestaurantData {
  cuisineType: string | null;
  priceRange: '$' | '$$' | '$$$' | '$$$$' | null;
  menuLink: string | null;
  reservationLink: string | null;
  onlineOrdering: boolean;
  deliveryAvailable: boolean;
  takeoutAvailable: boolean;
  dineInAvailable: boolean;
  outdoorSeating: boolean;
  alcoholServed: boolean;
}

export interface ContractorData {
  serviceArea: string[] | null;
  licenseNumber: string | null;
  licenseState: string | null;
  specialties: string[] | null;
  insured: boolean | null;
  bonded: boolean | null;
  emergencyService: boolean;
  freeEstimates: boolean;
  yearsExperience: number | null;
}

export interface MedicalData {
  acceptingNewPatients: boolean | null;
  insuranceAccepted: string[] | null;
  specialties: string[] | null;
  languages: string[] | null;
  telehealth: boolean;
  onlineBooking: boolean;
  appointmentLink: string | null;
  npiNumber: string | null;
  boardCertified: boolean | null;
}

export interface SalonData {
  bookingLink: string | null;
  servicesOffered: string[] | null;
  priceRange: '$' | '$$' | '$$$' | '$$$$' | null;
  walkInsAccepted: boolean;
  appointmentRequired: boolean;
  onlineBooking: boolean;
  giftCardsAvailable: boolean;
  productsSold: string[] | null;
}

export interface RetailData {
  onlineShopping: boolean;
  storeHours: string | null;
  productCategories: string[] | null;
  priceRange: '$' | '$$' | '$$$' | '$$$$' | null;
  curbsidePickup: boolean;
  inStorePickup: boolean;
}

export interface ProfessionalServicesData {
  practiceAreas: string[] | null;
  credentials: string[] | null;
  freeConsultation: boolean;
  languages: string[] | null;
  onlineServices: boolean;
}

export interface AutomotiveData {
  servicesOffered: string[] | null;
  brandsServiced: string[] | null;
  certifications: string[] | null;
  loanerVehicles: boolean;
  shuttleService: boolean;
  appointmentLink: string | null;
}

export interface FitnessData {
  classesOffered: string[] | null;
  amenities: string[] | null;
  membershipTypes: string[] | null;
  freeTrialAvailable: boolean;
  personalTraining: boolean;
  openHours: string | null;
}

export type IndustrySpecificData =
  | { type: 'restaurant'; data: RestaurantData }
  | { type: 'contractor'; data: ContractorData }
  | { type: 'medical'; data: MedicalData }
  | { type: 'salon'; data: SalonData }
  | { type: 'retail'; data: RetailData }
  | { type: 'professional_services'; data: ProfessionalServicesData }
  | { type: 'automotive'; data: AutomotiveData }
  | { type: 'fitness'; data: FitnessData }
  | { type: 'hospitality' | 'other'; data: null };

// ============ Industry Detection ============

const INDUSTRY_KEYWORDS: Record<IndustryType, string[]> = {
  restaurant: [
    'restaurant', 'cafe', 'bistro', 'diner', 'eatery', 'grill', 'kitchen',
    'pizzeria', 'pizza', 'bakery', 'bar', 'pub', 'tavern', 'brewery', 'winery',
    'sushi', 'taco', 'burger', 'steakhouse', 'seafood', 'thai', 'chinese',
    'italian', 'mexican', 'indian', 'japanese', 'korean', 'vietnamese',
    'coffee', 'tea house', 'juice bar', 'food truck', 'catering', 'food',
  ],
  contractor: [
    'contractor', 'construction', 'plumber', 'plumbing', 'electrician',
    'electrical', 'hvac', 'heating', 'cooling', 'roofing', 'roofer',
    'painter', 'painting', 'carpenter', 'carpentry', 'flooring', 'tile',
    'landscaping', 'lawn care', 'tree service', 'handyman', 'remodeling',
    'renovation', 'builder', 'home improvement', 'general contractor',
    'pest control', 'exterminator', 'pool service', 'fence', 'deck',
  ],
  medical: [
    'doctor', 'physician', 'dentist', 'dental', 'orthodontist', 'clinic',
    'medical center', 'hospital', 'urgent care', 'chiropractor', 'chiropractic',
    'optometrist', 'ophthalmologist', 'dermatologist', 'pediatrician',
    'gynecologist', 'cardiologist', 'orthopedic', 'physical therapy', 'therapist',
    'psychiatrist', 'psychologist', 'counselor', 'veterinarian', 'vet',
    'pharmacy', 'pharmacist', 'health center', 'healthcare', 'md', 'dds', 'dmd',
  ],
  salon: [
    'salon', 'spa', 'hair', 'barber', 'barbershop', 'beauty', 'nail',
    'manicure', 'pedicure', 'massage', 'waxing', 'facial', 'esthetician',
    'skin care', 'tanning', 'brow', 'lash', 'makeup', 'stylist',
    'cosmetology', 'day spa', 'med spa', 'wellness spa',
  ],
  retail: [
    'store', 'shop', 'boutique', 'outlet', 'retailer', 'market', 'mart',
    'emporium', 'gallery', 'showroom', 'warehouse', 'depot',
  ],
  professional_services: [
    'law firm', 'attorney', 'lawyer', 'accountant', 'cpa', 'tax',
    'consultant', 'consulting', 'agency', 'insurance', 'financial',
    'advisor', 'real estate', 'realtor', 'architect', 'engineer',
    'marketing', 'advertising', 'pr firm', 'design studio',
  ],
  automotive: [
    'auto', 'automotive', 'car', 'vehicle', 'mechanic', 'body shop',
    'tire', 'oil change', 'transmission', 'brake', 'alignment',
    'dealership', 'car wash', 'detailing', 'collision',
  ],
  fitness: [
    'gym', 'fitness', 'workout', 'exercise', 'crossfit', 'yoga',
    'pilates', 'martial arts', 'boxing', 'kickboxing', 'dance studio',
    'personal trainer', 'health club', 'athletic', 'sports',
  ],
  hospitality: [
    'hotel', 'motel', 'inn', 'resort', 'lodge', 'bed and breakfast',
    'hostel', 'vacation rental', 'airbnb', 'vrbo',
  ],
  other: [],
};

/**
 * Detect the industry type from business name and query
 */
export function detectIndustryType(
  businessName: string,
  query?: string,
  category?: string
): IndustryType {
  const text = `${businessName} ${query || ''} ${category || ''}`.toLowerCase();

  // Check each industry in order of specificity
  const industries: IndustryType[] = [
    'medical',
    'salon',
    'restaurant',
    'contractor',
    'automotive',
    'fitness',
    'professional_services',
    'hospitality',
    'retail',
  ];

  for (const industry of industries) {
    const keywords = INDUSTRY_KEYWORDS[industry];
    if (keywords.some(keyword => text.includes(keyword))) {
      return industry;
    }
  }

  return 'other';
}

// ============ Data Extraction from HTML ============

/**
 * Extract restaurant-specific data from page content
 */
export function extractRestaurantData(
  pageText: string,
  links: string[]
): RestaurantData {
  const text = pageText.toLowerCase();

  // Detect cuisine type
  const cuisines = [
    'italian', 'mexican', 'chinese', 'japanese', 'thai', 'indian', 'korean',
    'vietnamese', 'french', 'mediterranean', 'greek', 'american', 'southern',
    'bbq', 'seafood', 'sushi', 'pizza', 'steakhouse', 'vegan', 'vegetarian',
  ];
  const detectedCuisine = cuisines.find(c => text.includes(c));

  // Detect price range from $ symbols or keywords
  let priceRange: RestaurantData['priceRange'] = null;
  if (text.includes('$$$$') || text.includes('fine dining') || text.includes('upscale')) {
    priceRange = '$$$$';
  } else if (text.includes('$$$') || text.includes('premium')) {
    priceRange = '$$$';
  } else if (text.includes('$$') || text.includes('moderate')) {
    priceRange = '$$';
  } else if (text.includes('$') || text.includes('affordable') || text.includes('budget')) {
    priceRange = '$';
  }

  // Find menu and reservation links
  const menuLink = links.find(l =>
    l.includes('menu') || l.includes('/food')
  ) || null;

  const reservationLink = links.find(l =>
    l.includes('reservation') || l.includes('booking') ||
    l.includes('opentable') || l.includes('resy') ||
    l.includes('yelp.com/reservations')
  ) || null;

  return {
    cuisineType: detectedCuisine || null,
    priceRange,
    menuLink,
    reservationLink,
    onlineOrdering: text.includes('online order') || text.includes('order online') ||
      links.some(l => l.includes('order') || l.includes('doordash') || l.includes('grubhub') || l.includes('ubereats')),
    deliveryAvailable: text.includes('delivery') || text.includes('deliver'),
    takeoutAvailable: text.includes('takeout') || text.includes('take out') || text.includes('to go') || text.includes('pickup'),
    dineInAvailable: text.includes('dine in') || text.includes('dine-in') || !text.includes('delivery only'),
    outdoorSeating: text.includes('outdoor') || text.includes('patio') || text.includes('rooftop'),
    alcoholServed: text.includes('beer') || text.includes('wine') || text.includes('cocktail') ||
      text.includes('bar') || text.includes('happy hour'),
  };
}

/**
 * Extract contractor-specific data from page content
 */
export function extractContractorData(
  pageText: string,
  links: string[]
): ContractorData {
  const text = pageText.toLowerCase();

  // Extract license number (common patterns)
  // Must have a separator (#, :, or space) followed by alphanumeric
  const licensePatterns = [
    /licensed?\s*[#:]\s*([A-Z0-9][A-Z0-9-]{2,})/i,
    /licensed?\s+#\s*([A-Z0-9][A-Z0-9-]{2,})/i,
    /lic\s*[#:]\s*([A-Z0-9][A-Z0-9-]{2,})/i,
    /contractor\s+license\s*[#:]?\s*([A-Z0-9][A-Z0-9-]{2,})/i,
    /cslb\s*[#:]?\s*([0-9]{4,})/i,
  ];
  let licenseNumber: string | null = null;
  for (const pattern of licensePatterns) {
    const match = pageText.match(pattern);
    if (match && match[1].length >= 3) {
      licenseNumber = match[1];
      break;
    }
  }

  // Extract state abbreviations for license
  const statePattern = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/g;
  const stateMatches = text.match(statePattern);
  const licenseState = stateMatches?.[0] || null;

  // Extract service areas (look for "serving" followed by locations)
  const serviceAreaPatterns = [
    /serv(?:ing|ice area)[:\s]*([^.!?\n]+)/i,
    /we serve[:\s]*([^.!?\n]+)/i,
    /areas served[:\s]*([^.!?\n]+)/i,
  ];
  let serviceArea: string[] | null = null;
  for (const pattern of serviceAreaPatterns) {
    const match = pageText.match(pattern);
    if (match) {
      // Split on comma or "and" but preserve full city names
      serviceArea = match[1]
        .split(/,|\band\b/i)
        .map(s => s.trim())
        .filter(s => s.length > 0 && s.length < 50); // Filter out overly long matches
      break;
    }
  }

  // Detect specialties
  const specialtyKeywords = [
    'residential', 'commercial', 'industrial', 'remodel', 'new construction',
    'repair', 'installation', 'maintenance', 'emergency', 'custom',
  ];
  const specialties = specialtyKeywords.filter(s => text.includes(s));

  return {
    serviceArea,
    licenseNumber,
    licenseState,
    specialties: specialties.length > 0 ? specialties : null,
    insured: text.includes('insured') ? true : text.includes('not insured') ? false : null,
    bonded: text.includes('bonded') ? true : text.includes('not bonded') ? false : null,
    emergencyService: text.includes('emergency') || text.includes('24/7') || text.includes('24 hour'),
    freeEstimates: text.includes('free estimate') || text.includes('free quote'),
    yearsExperience: extractYearsExperience(pageText),
  };
}

/**
 * Extract medical-specific data from page content
 */
export function extractMedicalData(
  pageText: string,
  links: string[]
): MedicalData {
  const text = pageText.toLowerCase();

  // Check if accepting new patients (check negatives first!)
  let acceptingNewPatients: boolean | null = null;
  if (text.includes('not accepting new patients') || text.includes('wait list') ||
      text.includes('not accepting patients') || text.includes('currently not accepting')) {
    acceptingNewPatients = false;
  } else if (text.includes('accepting new patients') || text.includes('now accepting patients') ||
             text.includes('welcoming new patients')) {
    acceptingNewPatients = true;
  }

  // Extract insurance types
  const insuranceKeywords = [
    'medicare', 'medicaid', 'blue cross', 'aetna', 'cigna', 'united healthcare',
    'humana', 'kaiser', 'anthem', 'delta dental', 'ppo', 'hmo',
  ];
  const insuranceAccepted = insuranceKeywords.filter(i => text.includes(i));

  // Extract specialties
  const medicalSpecialties = [
    'family medicine', 'internal medicine', 'pediatrics', 'cardiology',
    'dermatology', 'orthopedics', 'neurology', 'psychiatry', 'surgery',
    'ob/gyn', 'oncology', 'ophthalmology', 'dental', 'orthodontics',
    'cosmetic', 'emergency medicine', 'sports medicine', 'geriatrics',
  ];
  const specialties = medicalSpecialties.filter(s => text.includes(s));

  // Extract languages
  const languages = [
    'english', 'spanish', 'mandarin', 'cantonese', 'korean', 'vietnamese',
    'tagalog', 'russian', 'arabic', 'hindi', 'punjabi', 'french', 'german',
  ];
  const languagesSpoken = languages.filter(l => text.includes(l));

  // Extract NPI number
  const npiMatch = pageText.match(/npi[:\s#]*(\d{10})/i);
  const npiNumber = npiMatch ? npiMatch[1] : null;

  // Find appointment booking link
  const appointmentLink = links.find(l =>
    l.includes('appointment') || l.includes('book') || l.includes('schedule') ||
    l.includes('zocdoc') || l.includes('healthgrades') || l.includes('doctolib')
  ) || null;

  return {
    acceptingNewPatients,
    insuranceAccepted: insuranceAccepted.length > 0 ? insuranceAccepted : null,
    specialties: specialties.length > 0 ? specialties : null,
    languages: languagesSpoken.length > 0 ? languagesSpoken : null,
    telehealth: text.includes('telehealth') || text.includes('telemedicine') || text.includes('virtual visit'),
    onlineBooking: text.includes('online booking') || text.includes('book online') || appointmentLink !== null,
    appointmentLink,
    npiNumber,
    boardCertified: text.includes('board certified') ? true : null,
  };
}

/**
 * Extract salon-specific data from page content
 */
export function extractSalonData(
  pageText: string,
  links: string[]
): SalonData {
  const text = pageText.toLowerCase();

  // Find booking link
  const bookingLink = links.find(l =>
    l.includes('book') || l.includes('appointment') || l.includes('schedule') ||
    l.includes('styleseat') || l.includes('vagaro') || l.includes('mindbody') ||
    l.includes('schedulicity') || l.includes('square.site')
  ) || null;

  // Detect services
  const salonServices = [
    'haircut', 'color', 'highlights', 'balayage', 'blowout', 'styling',
    'manicure', 'pedicure', 'gel nails', 'acrylic', 'massage', 'facial',
    'waxing', 'brows', 'lashes', 'extensions', 'keratin', 'perm',
    'makeup', 'spray tan', 'body wrap',
  ];
  const servicesOffered = salonServices.filter(s => text.includes(s));

  // Detect products
  const productBrands = [
    'redken', 'aveda', 'olaplex', 'kerastase', 'paul mitchell', 'chi',
    'opi', 'essie', 'cnd', 'orly', 'dermalogica', 'murad',
  ];
  const productsSold = productBrands.filter(b => text.includes(b));

  // Detect price range
  let priceRange: SalonData['priceRange'] = null;
  if (text.includes('luxury') || text.includes('premium') || text.includes('exclusive')) {
    priceRange = '$$$$';
  } else if (text.includes('upscale') || text.includes('high-end')) {
    priceRange = '$$$';
  } else if (text.includes('affordable') || text.includes('budget')) {
    priceRange = '$';
  } else {
    priceRange = '$$';
  }

  return {
    bookingLink,
    servicesOffered: servicesOffered.length > 0 ? servicesOffered : null,
    priceRange,
    walkInsAccepted: text.includes('walk-in') || text.includes('walk in') || text.includes('no appointment'),
    appointmentRequired: text.includes('appointment required') || text.includes('by appointment only'),
    onlineBooking: text.includes('book online') || text.includes('online booking') || bookingLink !== null,
    giftCardsAvailable: text.includes('gift card') || text.includes('gift certificate'),
    productsSold: productsSold.length > 0 ? productsSold : null,
  };
}

// ============ Helper Functions ============

function extractYearsExperience(text: string): number | null {
  const patterns = [
    /(\d+)\+?\s*years?\s*(?:of\s*)?experience/i,
    /experience[:\s]*(\d+)\+?\s*years?/i,
    /serving.*for\s*(\d+)\+?\s*years?/i,
    /in\s*business\s*(?:for\s*)?(\d+)\+?\s*years?/i,
    /since\s*(\d{4})/i, // Will calculate from year
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseInt(match[1]);
      // If it's a year (since 19XX or 20XX), calculate years
      if (value > 1900 && value <= new Date().getFullYear()) {
        return new Date().getFullYear() - value;
      }
      if (value > 0 && value < 100) {
        return value;
      }
    }
  }

  return null;
}

// ============ Main Enrichment Function ============

export interface EnrichmentInput {
  businessName: string;
  query?: string;
  category?: string;
  pageContent?: string;
  pageLinks?: string[];
}

/**
 * Enrich a business with industry-specific data
 */
export function enrichWithIndustryData(
  input: EnrichmentInput
): IndustrySpecificData {
  const industryType = detectIndustryType(
    input.businessName,
    input.query,
    input.category
  );

  const text = input.pageContent || '';
  const links = input.pageLinks || [];

  switch (industryType) {
    case 'restaurant':
      return {
        type: 'restaurant',
        data: extractRestaurantData(text, links),
      };

    case 'contractor':
      return {
        type: 'contractor',
        data: extractContractorData(text, links),
      };

    case 'medical':
      return {
        type: 'medical',
        data: extractMedicalData(text, links),
      };

    case 'salon':
      return {
        type: 'salon',
        data: extractSalonData(text, links),
      };

    case 'retail':
      return {
        type: 'retail',
        data: extractRetailData(text, links),
      };

    case 'professional_services':
      return {
        type: 'professional_services',
        data: extractProfessionalServicesData(text, links),
      };

    case 'automotive':
      return {
        type: 'automotive',
        data: extractAutomotiveData(text, links),
      };

    case 'fitness':
      return {
        type: 'fitness',
        data: extractFitnessData(text, links),
      };

    default:
      return {
        type: industryType,
        data: null,
      };
  }
}

// Additional extraction functions

function extractRetailData(text: string, links: string[]): RetailData {
  const pageText = text.toLowerCase();

  // Find price range
  let priceRange: RetailData['priceRange'] = null;
  if (pageText.includes('luxury') || pageText.includes('designer')) {
    priceRange = '$$$$';
  } else if (pageText.includes('premium')) {
    priceRange = '$$$';
  } else if (pageText.includes('discount') || pageText.includes('budget')) {
    priceRange = '$';
  } else {
    priceRange = '$$';
  }

  return {
    onlineShopping: pageText.includes('shop online') || pageText.includes('online store') ||
      links.some(l => l.includes('shop') || l.includes('store') || l.includes('product')),
    storeHours: null, // Would need structured data parsing
    productCategories: null,
    priceRange,
    curbsidePickup: pageText.includes('curbside') || pageText.includes('curb-side'),
    inStorePickup: pageText.includes('in-store pickup') || pageText.includes('bopis'),
  };
}

function extractProfessionalServicesData(text: string, links: string[]): ProfessionalServicesData {
  const pageText = text.toLowerCase();

  // Detect practice areas (for legal)
  const practiceAreas = [
    'personal injury', 'family law', 'criminal defense', 'estate planning',
    'business law', 'immigration', 'bankruptcy', 'real estate', 'employment law',
  ];
  const detectedAreas = practiceAreas.filter(a => pageText.includes(a));

  // Detect credentials
  const credentials = [
    'jd', 'cpa', 'cfp', 'mba', 'phd', 'esq', 'aia', 'pe',
  ];
  const detectedCredentials = credentials.filter(c =>
    new RegExp(`\\b${c}\\b`, 'i').test(text)
  );

  // Languages
  const languages = ['english', 'spanish', 'mandarin', 'vietnamese', 'korean'];
  const detectedLanguages = languages.filter(l => pageText.includes(l));

  return {
    practiceAreas: detectedAreas.length > 0 ? detectedAreas : null,
    credentials: detectedCredentials.length > 0 ? detectedCredentials : null,
    freeConsultation: pageText.includes('free consultation') || pageText.includes('complimentary consultation'),
    languages: detectedLanguages.length > 0 ? detectedLanguages : null,
    onlineServices: pageText.includes('virtual') || pageText.includes('remote') || pageText.includes('online'),
  };
}

function extractAutomotiveData(text: string, links: string[]): AutomotiveData {
  const pageText = text.toLowerCase();

  // Services
  const services = [
    'oil change', 'brake', 'tire', 'transmission', 'engine', 'alignment',
    'inspection', 'tune-up', 'ac repair', 'battery', 'exhaust', 'suspension',
  ];
  const detectedServices = services.filter(s => pageText.includes(s));

  // Brands
  const brands = [
    'toyota', 'honda', 'ford', 'chevrolet', 'bmw', 'mercedes', 'audi',
    'volkswagen', 'nissan', 'hyundai', 'kia', 'subaru', 'mazda',
  ];
  const detectedBrands = brands.filter(b => pageText.includes(b));

  // Certifications
  const certs = ['ase certified', 'aaa approved', 'napa autocare'];
  const detectedCerts = certs.filter(c => pageText.includes(c));

  return {
    servicesOffered: detectedServices.length > 0 ? detectedServices : null,
    brandsServiced: detectedBrands.length > 0 ? detectedBrands : null,
    certifications: detectedCerts.length > 0 ? detectedCerts : null,
    loanerVehicles: pageText.includes('loaner') || pageText.includes('rental'),
    shuttleService: pageText.includes('shuttle'),
    appointmentLink: links.find(l => l.includes('appointment') || l.includes('schedule')) || null,
  };
}

function extractFitnessData(text: string, links: string[]): FitnessData {
  const pageText = text.toLowerCase();

  // Classes
  const classes = [
    'yoga', 'pilates', 'spin', 'cycling', 'zumba', 'crossfit', 'hiit',
    'boxing', 'kickboxing', 'barre', 'dance', 'strength', 'cardio',
  ];
  const detectedClasses = classes.filter(c => pageText.includes(c));

  // Amenities
  const amenities = [
    'pool', 'sauna', 'steam room', 'locker room', 'shower', 'parking',
    'childcare', 'towel service', 'wifi', 'smoothie bar',
  ];
  const detectedAmenities = amenities.filter(a => pageText.includes(a));

  // Membership types
  const memberships = [
    'monthly', 'annual', 'drop-in', 'class pack', 'unlimited', 'basic', 'premium',
  ];
  const detectedMemberships = memberships.filter(m => pageText.includes(m));

  return {
    classesOffered: detectedClasses.length > 0 ? detectedClasses : null,
    amenities: detectedAmenities.length > 0 ? detectedAmenities : null,
    membershipTypes: detectedMemberships.length > 0 ? detectedMemberships : null,
    freeTrialAvailable: pageText.includes('free trial') || pageText.includes('try free') || pageText.includes('guest pass'),
    personalTraining: pageText.includes('personal train') || pageText.includes('pt '),
    openHours: null,
  };
}

// ============ Serialization ============

/**
 * Convert industry data to a flat object for database storage
 */
export function flattenIndustryData(
  data: IndustrySpecificData
): Record<string, unknown> {
  if (!data.data) {
    return { industry_type: data.type };
  }

  const result: Record<string, unknown> = {
    industry_type: data.type,
  };

  // Prefix each field with industry type to avoid collisions
  for (const [key, value] of Object.entries(data.data)) {
    if (Array.isArray(value)) {
      result[`${data.type}_${key}`] = value.join(', ');
    } else {
      result[`${data.type}_${key}`] = value;
    }
  }

  return result;
}

/**
 * Parse flattened industry data back into structured format
 */
export function parseIndustryData(
  flat: Record<string, unknown>
): IndustrySpecificData | null {
  const industryType = flat.industry_type as IndustryType;
  if (!industryType) return null;

  if (industryType === 'hospitality' || industryType === 'other') {
    return { type: industryType, data: null };
  }

  const prefix = `${industryType}_`;
  const data: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(flat)) {
    if (key.startsWith(prefix)) {
      const fieldName = key.substring(prefix.length);
      // Convert comma-separated strings back to arrays for known array fields
      if (typeof value === 'string' && isArrayField(industryType, fieldName)) {
        data[fieldName] = value.split(', ').filter(Boolean);
      } else {
        data[fieldName] = value;
      }
    }
  }

  return { type: industryType, data } as unknown as IndustrySpecificData;
}

function isArrayField(industryType: IndustryType, fieldName: string): boolean {
  const arrayFields: Record<string, string[]> = {
    restaurant: [],
    contractor: ['serviceArea', 'specialties'],
    medical: ['insuranceAccepted', 'specialties', 'languages'],
    salon: ['servicesOffered', 'productsSold'],
    retail: ['productCategories'],
    professional_services: ['practiceAreas', 'credentials', 'languages'],
    automotive: ['servicesOffered', 'brandsServiced', 'certifications'],
    fitness: ['classesOffered', 'amenities', 'membershipTypes'],
    hospitality: [],
    other: [],
  };

  return arrayFields[industryType]?.includes(fieldName) || false;
}

// ============ Export Helpers ============

/**
 * Get column headers for industry-specific data in exports
 */
export function getIndustryExportHeaders(industryType: IndustryType): string[] {
  switch (industryType) {
    case 'restaurant':
      return [
        'Cuisine Type', 'Price Range', 'Menu Link', 'Reservation Link',
        'Online Ordering', 'Delivery', 'Takeout', 'Dine-In', 'Outdoor Seating',
      ];
    case 'contractor':
      return [
        'License Number', 'License State', 'Service Area', 'Specialties',
        'Insured', 'Bonded', '24/7 Emergency', 'Free Estimates', 'Years Experience',
      ];
    case 'medical':
      return [
        'Accepting Patients', 'Insurance Accepted', 'Specialties', 'Languages',
        'Telehealth', 'Online Booking', 'NPI Number', 'Board Certified',
      ];
    case 'salon':
      return [
        'Booking Link', 'Services', 'Price Range', 'Walk-Ins', 'Online Booking',
        'Gift Cards', 'Products Sold',
      ];
    default:
      return [];
  }
}

/**
 * Get export row values for industry-specific data
 */
export function getIndustryExportValues(
  data: IndustrySpecificData
): (string | boolean | null)[] {
  if (!data.data) return [];

  switch (data.type) {
    case 'restaurant': {
      const d = data.data;
      return [
        d.cuisineType, d.priceRange, d.menuLink, d.reservationLink,
        d.onlineOrdering, d.deliveryAvailable, d.takeoutAvailable,
        d.dineInAvailable, d.outdoorSeating,
      ];
    }
    case 'contractor': {
      const d = data.data;
      return [
        d.licenseNumber, d.licenseState, d.serviceArea?.join(', ') || null,
        d.specialties?.join(', ') || null, d.insured, d.bonded,
        d.emergencyService, d.freeEstimates, d.yearsExperience?.toString() || null,
      ];
    }
    case 'medical': {
      const d = data.data;
      return [
        d.acceptingNewPatients, d.insuranceAccepted?.join(', ') || null,
        d.specialties?.join(', ') || null, d.languages?.join(', ') || null,
        d.telehealth, d.onlineBooking, d.npiNumber, d.boardCertified,
      ];
    }
    case 'salon': {
      const d = data.data;
      return [
        d.bookingLink, d.servicesOffered?.join(', ') || null, d.priceRange,
        d.walkInsAccepted, d.onlineBooking, d.giftCardsAvailable,
        d.productsSold?.join(', ') || null,
      ];
    }
    default:
      return [];
  }
}
