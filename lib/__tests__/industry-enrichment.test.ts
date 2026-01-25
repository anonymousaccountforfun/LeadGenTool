/**
 * Tests for Industry-Specific Enrichment Module
 */

import { describe, it, expect } from 'vitest';
import {
  detectIndustryType,
  enrichWithIndustryData,
  extractRestaurantData,
  extractContractorData,
  extractMedicalData,
  extractSalonData,
  flattenIndustryData,
  parseIndustryData,
  getIndustryExportHeaders,
  getIndustryExportValues,
  type IndustryType,
  type IndustrySpecificData,
} from '../industry-enrichment';

describe('Industry Enrichment', () => {
  describe('detectIndustryType', () => {
    const testCases: Array<{ name: string; query?: string; expected: IndustryType }> = [
      // Restaurants
      { name: "Joe's Pizza", query: 'pizza restaurant', expected: 'restaurant' },
      { name: 'Sakura Sushi Bar', expected: 'restaurant' },
      { name: 'The Coffee House', expected: 'restaurant' },
      { name: 'Downtown Bistro & Grill', expected: 'restaurant' },

      // Contractors
      { name: "Bob's Plumbing Services", expected: 'contractor' },
      { name: 'ABC Electric Inc', query: 'electrician', expected: 'contractor' },
      { name: 'Quality Roofing Co', expected: 'contractor' },
      { name: 'Green Lawn Landscaping', expected: 'contractor' },

      // Medical
      { name: 'Dr. Smith Family Dentistry', expected: 'medical' },
      { name: 'Valley Medical Clinic', expected: 'medical' },
      { name: 'Pacific Chiropractic Center', expected: 'medical' },
      { name: 'City Veterinary Hospital', expected: 'medical' },

      // Salons
      { name: 'Elegance Hair Salon', expected: 'salon' },
      { name: 'Serenity Day Spa', expected: 'salon' },
      { name: "Tony's Barbershop", expected: 'salon' },
      { name: 'Perfect Nails Studio', expected: 'salon' },

      // Professional Services
      { name: 'Johnson & Associates Law Firm', expected: 'professional_services' },
      { name: 'Smith CPA Tax Services', expected: 'professional_services' },
      { name: 'Premier Real Estate Group', expected: 'professional_services' },

      // Automotive
      { name: "Mike's Auto Repair", expected: 'automotive' },
      { name: 'Quick Tire & Brake Center', expected: 'automotive' },

      // Fitness
      { name: 'CrossFit Downtown', expected: 'fitness' },
      { name: 'Yoga Flow Studio', expected: 'fitness' },
      { name: 'Planet Fitness', expected: 'fitness' },

      // Hospitality
      { name: 'Grand Hotel & Resort', expected: 'hospitality' },
      { name: 'Cozy Bed and Breakfast', expected: 'hospitality' },

      // Retail
      { name: 'Sunshine Gift Shop', expected: 'retail' },
      { name: 'Fashion Boutique', expected: 'retail' },

      // Other
      { name: 'XYZ Corporation', expected: 'other' },
      { name: 'Random Company LLC', expected: 'other' },
    ];

    testCases.forEach(({ name, query, expected }) => {
      it(`should detect ${expected} for "${name}"`, () => {
        expect(detectIndustryType(name, query)).toBe(expected);
      });
    });

    it('should be case-insensitive', () => {
      expect(detectIndustryType('SUSHI RESTAURANT')).toBe('restaurant');
      expect(detectIndustryType('plumbing services')).toBe('contractor');
    });

    it('should consider category in detection', () => {
      expect(detectIndustryType('ABC Inc', undefined, 'Dental')).toBe('medical');
    });
  });

  describe('extractRestaurantData', () => {
    it('should detect cuisine type', () => {
      const text = 'Welcome to our authentic Italian restaurant with homemade pasta';
      const result = extractRestaurantData(text, []);

      expect(result.cuisineType).toBe('italian');
    });

    it('should detect price range from symbols', () => {
      const text1 = 'Fine dining experience $$$$';
      const text2 = 'Affordable meals for the whole family $';

      expect(extractRestaurantData(text1, []).priceRange).toBe('$$$$');
      expect(extractRestaurantData(text2, []).priceRange).toBe('$');
    });

    it('should detect price range from keywords', () => {
      const text = 'Upscale dining with a view';
      expect(extractRestaurantData(text, []).priceRange).toBe('$$$$');
    });

    it('should find menu links', () => {
      const links = [
        'https://example.com/about',
        'https://example.com/menu',
        'https://example.com/contact',
      ];
      const result = extractRestaurantData('', links);

      expect(result.menuLink).toBe('https://example.com/menu');
    });

    it('should find reservation links', () => {
      const links = [
        'https://example.com/about',
        'https://www.opentable.com/restaurant/123',
        'https://example.com/contact',
      ];
      const result = extractRestaurantData('', links);

      expect(result.reservationLink).toBe('https://www.opentable.com/restaurant/123');
    });

    it('should detect service options', () => {
      const text = `
        Order online for delivery or pickup!
        We also have outdoor patio seating.
        Happy hour specials on beer and wine.
      `;
      const result = extractRestaurantData(text, []);

      expect(result.onlineOrdering).toBe(true);
      expect(result.deliveryAvailable).toBe(true);
      expect(result.takeoutAvailable).toBe(true);
      expect(result.outdoorSeating).toBe(true);
      expect(result.alcoholServed).toBe(true);
    });
  });

  describe('extractContractorData', () => {
    it('should extract license number', () => {
      const text = 'Licensed and insured. License #ABC123456';
      const result = extractContractorData(text, []);

      expect(result.licenseNumber).toBe('ABC123456');
    });

    it('should extract CSLB license number', () => {
      const text = 'California State Contractors License CSLB #987654';
      const result = extractContractorData(text, []);

      expect(result.licenseNumber).toBe('987654');
    });

    it('should detect insured and bonded status', () => {
      const text = 'Fully licensed, insured, and bonded for your protection';
      const result = extractContractorData(text, []);

      expect(result.insured).toBe(true);
      expect(result.bonded).toBe(true);
    });

    it('should detect emergency service', () => {
      const text1 = '24/7 emergency service available';
      const text2 = 'Emergency plumbing repairs';

      expect(extractContractorData(text1, []).emergencyService).toBe(true);
      expect(extractContractorData(text2, []).emergencyService).toBe(true);
    });

    it('should detect free estimates', () => {
      const text = 'Call today for your free estimate!';
      const result = extractContractorData(text, []);

      expect(result.freeEstimates).toBe(true);
    });

    it('should extract years of experience', () => {
      const text1 = 'Over 25 years of experience';
      const text2 = 'In business since 2000';

      expect(extractContractorData(text1, []).yearsExperience).toBe(25);

      const result2 = extractContractorData(text2, []);
      const expectedYears = new Date().getFullYear() - 2000;
      expect(result2.yearsExperience).toBe(expectedYears);
    });

    it('should extract service area', () => {
      const text = 'Serving San Francisco, Oakland, and San Jose areas';
      const result = extractContractorData(text, []);

      expect(result.serviceArea).toContain('San Francisco');
      expect(result.serviceArea).toContain('Oakland');
    });

    it('should detect specialties', () => {
      const text = 'Specializing in residential remodeling and new construction';
      const result = extractContractorData(text, []);

      expect(result.specialties).toContain('residential');
      expect(result.specialties).toContain('remodel');
      expect(result.specialties).toContain('new construction');
    });
  });

  describe('extractMedicalData', () => {
    it('should detect accepting new patients', () => {
      const text1 = 'Now accepting new patients!';
      const text2 = 'Unfortunately, we are not accepting new patients at this time';

      expect(extractMedicalData(text1, []).acceptingNewPatients).toBe(true);
      expect(extractMedicalData(text2, []).acceptingNewPatients).toBe(false);
    });

    it('should extract insurance types', () => {
      const text = 'We accept Medicare, Blue Cross, and Aetna insurance plans';
      const result = extractMedicalData(text, []);

      expect(result.insuranceAccepted).toContain('medicare');
      expect(result.insuranceAccepted).toContain('blue cross');
      expect(result.insuranceAccepted).toContain('aetna');
    });

    it('should extract specialties', () => {
      const text = 'Specializing in family medicine, pediatrics, and sports medicine';
      const result = extractMedicalData(text, []);

      expect(result.specialties).toContain('family medicine');
      expect(result.specialties).toContain('pediatrics');
      expect(result.specialties).toContain('sports medicine');
    });

    it('should detect telehealth', () => {
      const text = 'Offering telehealth virtual visits';
      const result = extractMedicalData(text, []);

      expect(result.telehealth).toBe(true);
    });

    it('should extract NPI number', () => {
      const text = 'Provider NPI: 1234567890';
      const result = extractMedicalData(text, []);

      expect(result.npiNumber).toBe('1234567890');
    });

    it('should find appointment booking links', () => {
      const links = [
        'https://example.com/about',
        'https://www.zocdoc.com/doctor/123',
        'https://example.com/contact',
      ];
      const result = extractMedicalData('', links);

      expect(result.appointmentLink).toBe('https://www.zocdoc.com/doctor/123');
    });

    it('should detect board certification', () => {
      const text = 'Dr. Smith is board certified in internal medicine';
      const result = extractMedicalData(text, []);

      expect(result.boardCertified).toBe(true);
    });
  });

  describe('extractSalonData', () => {
    it('should find booking links', () => {
      const links = [
        'https://example.com/about',
        'https://www.vagaro.com/salon123/book',
        'https://example.com/contact',
      ];
      const result = extractSalonData('', links);

      expect(result.bookingLink).toBe('https://www.vagaro.com/salon123/book');
    });

    it('should detect services offered', () => {
      const text = 'Services include haircut, color, highlights, and balayage';
      const result = extractSalonData(text, []);

      expect(result.servicesOffered).toContain('haircut');
      expect(result.servicesOffered).toContain('color');
      expect(result.servicesOffered).toContain('highlights');
      expect(result.servicesOffered).toContain('balayage');
    });

    it('should detect price range', () => {
      const text = 'Luxury salon experience with premium services';
      const result = extractSalonData(text, []);

      expect(result.priceRange).toBe('$$$$');
    });

    it('should detect walk-ins accepted', () => {
      const text = 'Walk-ins welcome!';
      const result = extractSalonData(text, []);

      expect(result.walkInsAccepted).toBe(true);
    });

    it('should detect appointment required', () => {
      const text = 'By appointment only';
      const result = extractSalonData(text, []);

      expect(result.appointmentRequired).toBe(true);
    });

    it('should detect products sold', () => {
      const text = 'We carry Aveda, Olaplex, and Redken products';
      const result = extractSalonData(text, []);

      expect(result.productsSold).toContain('aveda');
      expect(result.productsSold).toContain('olaplex');
      expect(result.productsSold).toContain('redken');
    });
  });

  describe('enrichWithIndustryData', () => {
    it('should return correct type for restaurants', () => {
      const result = enrichWithIndustryData({
        businessName: "Joe's Pizza",
        query: 'pizza',
        pageContent: 'Italian cuisine with outdoor patio',
      });

      expect(result.type).toBe('restaurant');
      expect(result.data).toBeDefined();
      if (result.type === 'restaurant') {
        expect(result.data.cuisineType).toBe('italian');
        expect(result.data.outdoorSeating).toBe(true);
      }
    });

    it('should return correct type for contractors', () => {
      const result = enrichWithIndustryData({
        businessName: "Bob's Plumbing",
        pageContent: 'Licensed #123456. Free estimates. 24/7 emergency service.',
      });

      expect(result.type).toBe('contractor');
      if (result.type === 'contractor') {
        expect(result.data.licenseNumber).toBe('123456');
        expect(result.data.freeEstimates).toBe(true);
        expect(result.data.emergencyService).toBe(true);
      }
    });

    it('should return correct type for medical', () => {
      const result = enrichWithIndustryData({
        businessName: 'Family Dental Clinic',
        pageContent: 'Accepting new patients. We take Medicare and Blue Cross.',
      });

      expect(result.type).toBe('medical');
      if (result.type === 'medical') {
        expect(result.data.acceptingNewPatients).toBe(true);
        expect(result.data.insuranceAccepted).toContain('medicare');
      }
    });

    it('should return null data for unknown industry', () => {
      const result = enrichWithIndustryData({
        businessName: 'Generic Company LLC',
      });

      expect(result.type).toBe('other');
      expect(result.data).toBeNull();
    });
  });

  describe('flattenIndustryData', () => {
    it('should flatten restaurant data', () => {
      const data: IndustrySpecificData = {
        type: 'restaurant',
        data: {
          cuisineType: 'italian',
          priceRange: '$$',
          menuLink: 'https://example.com/menu',
          reservationLink: null,
          onlineOrdering: true,
          deliveryAvailable: true,
          takeoutAvailable: true,
          dineInAvailable: true,
          outdoorSeating: false,
          alcoholServed: true,
        },
      };

      const flat = flattenIndustryData(data);

      expect(flat.industry_type).toBe('restaurant');
      expect(flat.restaurant_cuisineType).toBe('italian');
      expect(flat.restaurant_priceRange).toBe('$$');
      expect(flat.restaurant_onlineOrdering).toBe(true);
    });

    it('should flatten contractor data with arrays', () => {
      const data: IndustrySpecificData = {
        type: 'contractor',
        data: {
          serviceArea: ['San Francisco', 'Oakland'],
          licenseNumber: '123456',
          licenseState: 'CA',
          specialties: ['residential', 'remodel'],
          insured: true,
          bonded: true,
          emergencyService: false,
          freeEstimates: true,
          yearsExperience: 25,
        },
      };

      const flat = flattenIndustryData(data);

      expect(flat.contractor_serviceArea).toBe('San Francisco, Oakland');
      expect(flat.contractor_specialties).toBe('residential, remodel');
    });

    it('should handle null data', () => {
      const data: IndustrySpecificData = {
        type: 'other',
        data: null,
      };

      const flat = flattenIndustryData(data);

      expect(flat.industry_type).toBe('other');
      expect(Object.keys(flat).length).toBe(1);
    });
  });

  describe('parseIndustryData', () => {
    it('should parse flattened restaurant data', () => {
      const flat = {
        industry_type: 'restaurant',
        restaurant_cuisineType: 'mexican',
        restaurant_priceRange: '$',
        restaurant_onlineOrdering: true,
      };

      const result = parseIndustryData(flat);

      expect(result?.type).toBe('restaurant');
      if (result?.type === 'restaurant') {
        expect(result.data.cuisineType).toBe('mexican');
        expect(result.data.priceRange).toBe('$');
        expect(result.data.onlineOrdering).toBe(true);
      }
    });

    it('should parse arrays from comma-separated strings', () => {
      const flat = {
        industry_type: 'contractor',
        contractor_serviceArea: 'LA, San Diego, Riverside',
        contractor_specialties: 'residential, commercial',
        contractor_licenseNumber: '999',
      };

      const result = parseIndustryData(flat);

      if (result?.type === 'contractor') {
        expect(result.data.serviceArea).toEqual(['LA', 'San Diego', 'Riverside']);
        expect(result.data.specialties).toEqual(['residential', 'commercial']);
      }
    });

    it('should return null for missing industry_type', () => {
      const result = parseIndustryData({});
      expect(result).toBeNull();
    });

    it('should handle other/hospitality types', () => {
      const result = parseIndustryData({ industry_type: 'hospitality' });
      expect(result?.type).toBe('hospitality');
      expect(result?.data).toBeNull();
    });
  });

  describe('getIndustryExportHeaders', () => {
    it('should return restaurant headers', () => {
      const headers = getIndustryExportHeaders('restaurant');

      expect(headers).toContain('Cuisine Type');
      expect(headers).toContain('Price Range');
      expect(headers).toContain('Menu Link');
      expect(headers).toContain('Reservation Link');
    });

    it('should return contractor headers', () => {
      const headers = getIndustryExportHeaders('contractor');

      expect(headers).toContain('License Number');
      expect(headers).toContain('Service Area');
      expect(headers).toContain('Free Estimates');
    });

    it('should return medical headers', () => {
      const headers = getIndustryExportHeaders('medical');

      expect(headers).toContain('Accepting Patients');
      expect(headers).toContain('Insurance Accepted');
      expect(headers).toContain('Telehealth');
    });

    it('should return salon headers', () => {
      const headers = getIndustryExportHeaders('salon');

      expect(headers).toContain('Booking Link');
      expect(headers).toContain('Services');
      expect(headers).toContain('Walk-Ins');
    });

    it('should return empty array for unknown industries', () => {
      const headers = getIndustryExportHeaders('other');
      expect(headers).toEqual([]);
    });
  });

  describe('getIndustryExportValues', () => {
    it('should return restaurant values', () => {
      const data: IndustrySpecificData = {
        type: 'restaurant',
        data: {
          cuisineType: 'thai',
          priceRange: '$$',
          menuLink: 'https://example.com/menu',
          reservationLink: null,
          onlineOrdering: true,
          deliveryAvailable: true,
          takeoutAvailable: false,
          dineInAvailable: true,
          outdoorSeating: true,
          alcoholServed: false,
        },
      };

      const values = getIndustryExportValues(data);

      expect(values[0]).toBe('thai'); // cuisineType
      expect(values[1]).toBe('$$'); // priceRange
      expect(values[2]).toBe('https://example.com/menu'); // menuLink
      expect(values[4]).toBe(true); // onlineOrdering
    });

    it('should return contractor values with joined arrays', () => {
      const data: IndustrySpecificData = {
        type: 'contractor',
        data: {
          serviceArea: ['LA', 'OC'],
          licenseNumber: '999',
          licenseState: 'CA',
          specialties: ['plumbing', 'heating'],
          insured: true,
          bonded: false,
          emergencyService: true,
          freeEstimates: true,
          yearsExperience: 15,
        },
      };

      const values = getIndustryExportValues(data);

      expect(values[0]).toBe('999'); // licenseNumber
      expect(values[1]).toBe('CA'); // licenseState
      expect(values[2]).toBe('LA, OC'); // serviceArea joined
      expect(values[3]).toBe('plumbing, heating'); // specialties joined
    });

    it('should return empty array for null data', () => {
      const data: IndustrySpecificData = {
        type: 'other',
        data: null,
      };

      const values = getIndustryExportValues(data);
      expect(values).toEqual([]);
    });
  });
});
