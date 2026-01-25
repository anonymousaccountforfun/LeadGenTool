/**
 * Tests for Multi-Format Export Module
 */

import { describe, it, expect } from 'vitest';
import {
  generateCsv,
  generateTsv,
  generateJson,
  generateHubSpotCsv,
  generateSalesforceCsv,
  generatePipedriveCsv,
  generateMailchimpCsv,
  exportBusinesses,
  getAvailableFormats,
  EXPORT_COLUMNS,
  CRM_FIELD_MAPPINGS,
} from '../export';
import { Business } from '../db';

// Mock business data for testing
const mockBusinesses: Business[] = [
  {
    id: 1,
    job_id: 'job_test',
    name: 'Test Business 1',
    website: 'https://test1.com',
    email: 'contact@test1.com',
    email_source: 'website',
    email_confidence: 0.9,
    phone: '555-123-4567',
    address: '123 Main St, City, ST 12345',
    instagram: '@test1',
    rating: 4.5,
    review_count: 100,
    years_in_business: 5,
    source: 'google_maps',
    employee_count: 25,
    industry_code: 'restaurant_food',
    is_b2b: false,
    created_at: '2024-01-01',
  },
  {
    id: 2,
    job_id: 'job_test',
    name: 'Test Business 2',
    website: 'https://test2.com',
    email: null,
    email_source: null,
    email_confidence: 0,
    phone: null,
    address: '456 Oak Ave',
    instagram: null,
    rating: 3.8,
    review_count: 50,
    years_in_business: null,
    source: 'yelp',
    employee_count: null,
    industry_code: null,
    is_b2b: false, // Default to B2C when unknown
    created_at: '2024-01-02',
  },
  {
    id: 3,
    job_id: 'job_test',
    name: 'Business, With "Quotes"',
    website: null,
    email: 'info@test3.com',
    email_source: 'api',
    email_confidence: 0.6,
    phone: '555-987-6543',
    address: null,
    instagram: null,
    rating: null,
    review_count: null,
    years_in_business: 10,
    source: 'bbb',
    employee_count: 100,
    industry_code: 'professional_services',
    is_b2b: true,
    created_at: '2024-01-03',
  },
];

describe('CSV Export', () => {
  it('should generate valid CSV with headers', () => {
    const csv = generateCsv(mockBusinesses);
    const lines = csv.split('\n');

    // Should have header + 3 data rows
    expect(lines.length).toBe(4);

    // Header should contain column names
    expect(lines[0]).toContain('Name');
    expect(lines[0]).toContain('Email');
    expect(lines[0]).toContain('Website');
  });

  it('should escape fields with commas and quotes', () => {
    const csv = generateCsv(mockBusinesses);

    // Business name with comma and quotes should be escaped
    expect(csv).toContain('"Business, With ""Quotes"""');
  });

  it('should generate CSV without headers when specified', () => {
    const csv = generateCsv(mockBusinesses, { includeHeaders: false });
    const lines = csv.split('\n');

    // Should have 3 data rows, no header
    expect(lines.length).toBe(3);
    expect(lines[0]).not.toContain('Name');
  });

  it('should filter by selected IDs', () => {
    const csv = generateCsv(mockBusinesses, { selectedIds: [1, 3] });
    const lines = csv.split('\n');

    // Header + 2 selected rows
    expect(lines.length).toBe(3);
    expect(csv).toContain('Test Business 1');
    // CSV escapes the quotes by doubling them
    expect(csv).toContain('Business, With ""Quotes""');
    expect(csv).not.toContain('Test Business 2');
  });

  it('should use specified columns', () => {
    const csv = generateCsv(mockBusinesses, {
      columns: ['name', 'email', 'phone'],
    });

    const header = csv.split('\n')[0];
    expect(header).toBe('Name,Email,Phone');
  });
});

describe('TSV Export', () => {
  it('should generate tab-separated values', () => {
    const tsv = generateTsv(mockBusinesses);
    const lines = tsv.split('\n');

    // Header should be tab-separated
    expect(lines[0].split('\t').length).toBeGreaterThan(1);
  });

  it('should replace tabs and newlines in values', () => {
    const businessWithTabs: Business[] = [{
      ...mockBusinesses[0],
      name: 'Name\twith\ttabs',
      address: 'Address\nwith\nnewlines',
    }];

    const tsv = generateTsv(businessWithTabs);

    // Should not contain literal tabs or newlines in values
    const dataLine = tsv.split('\n')[1];
    expect(dataLine).toContain('Name with tabs');
    expect(dataLine).toContain('Address with newlines');
  });

  it('should work without headers', () => {
    const tsv = generateTsv(mockBusinesses, { includeHeaders: false });
    const lines = tsv.split('\n');

    expect(lines.length).toBe(3);
    expect(lines[0]).toContain('Test Business 1');
  });
});

describe('JSON Export', () => {
  it('should generate valid JSON structure', () => {
    const json = generateJson(mockBusinesses);

    expect(json).toHaveProperty('exportedAt');
    expect(json).toHaveProperty('totalCount', 3);
    expect(json).toHaveProperty('businesses');
    expect(json).toHaveProperty('summary');
    expect(json.businesses).toHaveLength(3);
  });

  it('should include summary statistics', () => {
    const json = generateJson(mockBusinesses);

    expect(json.summary.withEmail).toBe(2);
    expect(json.summary.verifiedEmail).toBe(1); // Only 0.9 confidence
    expect(json.summary.b2cCount).toBe(2); // Business 1 and 2 are B2C
    expect(json.summary.sourceBreakdown).toHaveProperty('Google Maps', 1);
    expect(json.summary.sourceBreakdown).toHaveProperty('Yelp', 1);
    expect(json.summary.sourceBreakdown).toHaveProperty('BBB', 1);
  });

  it('should format business data correctly', () => {
    const json = generateJson(mockBusinesses);
    const business = json.businesses[0];

    expect(business.name).toBe('Test Business 1');
    expect(business.emailStatus).toBe('Verified');
    expect(business.companySize).toBe('11-50');
    expect(business.industry).toBe('Restaurant & Food');
    expect(business.businessType).toBe('B2C');
    expect(business.source).toBe('Google Maps');
  });

  it('should filter by selected IDs', () => {
    const json = generateJson(mockBusinesses, { selectedIds: [2] });

    expect(json.totalCount).toBe(1);
    expect(json.businesses[0].name).toBe('Test Business 2');
  });

  it('should handle null values gracefully', () => {
    const json = generateJson(mockBusinesses);
    const businessWithNulls = json.businesses[1];

    expect(businessWithNulls.email).toBeNull();
    expect(businessWithNulls.emailStatus).toBe('None');
    expect(businessWithNulls.companySize).toBe('Unknown');
    expect(businessWithNulls.businessType).toBe('B2C'); // is_b2b = false
  });
});

describe('Export Formats', () => {
  it('should list all available formats', () => {
    const formats = getAvailableFormats();

    expect(formats.length).toBe(8); // 4 standard + 4 CRM
    expect(formats.map(f => f.value)).toContain('excel');
    expect(formats.map(f => f.value)).toContain('csv');
    expect(formats.map(f => f.value)).toContain('json');
    expect(formats.map(f => f.value)).toContain('tsv');
    expect(formats.map(f => f.value)).toContain('hubspot');
    expect(formats.map(f => f.value)).toContain('salesforce');
    expect(formats.map(f => f.value)).toContain('pipedrive');
    expect(formats.map(f => f.value)).toContain('mailchimp');
  });

  it('should have labels and descriptions', () => {
    const formats = getAvailableFormats();

    for (const format of formats) {
      expect(format.label).toBeTruthy();
      expect(format.description).toBeTruthy();
    }
  });
});

describe('Unified Export Function', () => {
  it('should export CSV format', async () => {
    const result = await exportBusinesses(mockBusinesses, 'csv', 'test query');

    expect(result.mimeType).toBe('text/csv');
    expect(result.filename).toContain('.csv');
    expect(typeof result.data).toBe('string');
  });

  it('should export JSON format', async () => {
    const result = await exportBusinesses(mockBusinesses, 'json', 'test query');

    expect(result.mimeType).toBe('application/json');
    expect(result.filename).toContain('.json');
    expect(typeof result.data).toBe('string');

    // Should be valid JSON
    const parsed = JSON.parse(result.data as string);
    expect(parsed).toHaveProperty('businesses');
  });

  it('should export TSV format', async () => {
    const result = await exportBusinesses(mockBusinesses, 'tsv', 'test query');

    expect(result.mimeType).toBe('text/tab-separated-values');
    expect(result.filename).toContain('.tsv');
    expect(typeof result.data).toBe('string');
  });

  it('should export Excel format', async () => {
    const result = await exportBusinesses(mockBusinesses, 'excel', 'test query');

    expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(result.filename).toContain('.xlsx');
    expect(result.data instanceof Buffer).toBe(true);
  });

  it('should sanitize query in filename', async () => {
    const result = await exportBusinesses(mockBusinesses, 'csv', 'test / query & special');

    expect(result.filename).not.toContain('/');
    expect(result.filename).not.toContain('&');
    expect(result.filename).toContain('test___query___special');
  });

  it('should respect selected IDs', async () => {
    const result = await exportBusinesses(mockBusinesses, 'csv', 'test', {
      selectedIds: [1],
    });

    const csv = result.data as string;
    expect(csv).toContain('Test Business 1');
    expect(csv).not.toContain('Test Business 2');
    expect(csv).not.toContain('Business, With "Quotes"');
  });
});

describe('Column Configuration', () => {
  it('should have all expected columns defined', () => {
    const expectedColumns = [
      'name', 'website', 'email', 'email_status', 'email_confidence',
      'phone', 'address', 'instagram', 'rating', 'review_count',
      'years_in_business', 'employee_count', 'company_size',
      'industry', 'business_type', 'source'
    ];

    for (const col of expectedColumns) {
      expect(EXPORT_COLUMNS).toHaveProperty(col);
    }
  });
});

// ============ CRM Export Tests ============

describe('HubSpot CSV Export', () => {
  it('should generate valid HubSpot CSV with correct headers', () => {
    const csv = generateHubSpotCsv(mockBusinesses);
    const lines = csv.split('\n');

    // Check header
    const header = lines[0];
    expect(header).toContain('Email');
    expect(header).toContain('Company');
    expect(header).toContain('Phone Number');
    expect(header).toContain('Website URL');
    expect(header).toContain('Street Address');
    expect(header).toContain('City');
    expect(header).toContain('State/Region');
    expect(header).toContain('Industry');
    expect(header).toContain('Lead Status');
  });

  it('should include all businesses', () => {
    const csv = generateHubSpotCsv(mockBusinesses);
    const lines = csv.split('\n');

    // Header + 3 businesses
    expect(lines.length).toBe(4);
  });

  it('should parse address correctly', () => {
    const csv = generateHubSpotCsv(mockBusinesses);

    // Business 1 has full address: "123 Main St, City, ST 12345"
    expect(csv).toContain('123 Main St');
    expect(csv).toContain('City');
    expect(csv).toContain('ST');
  });

  it('should set lead status based on email confidence', () => {
    const csv = generateHubSpotCsv(mockBusinesses);

    // Business 1 has 0.9 confidence = Verified
    expect(csv).toContain('Verified');
    // Business 2 has no email = No Email
    expect(csv).toContain('No Email');
    // Business 3 has 0.6 confidence = Unverified
    expect(csv).toContain('Unverified');
  });

  it('should filter by selected IDs', () => {
    const csv = generateHubSpotCsv(mockBusinesses, { selectedIds: [1] });
    const lines = csv.split('\n');

    expect(lines.length).toBe(2); // Header + 1 business
    expect(csv).toContain('Test Business 1');
    expect(csv).not.toContain('Test Business 2');
  });
});

describe('Salesforce CSV Export', () => {
  it('should generate valid Salesforce CSV with correct headers', () => {
    const csv = generateSalesforceCsv(mockBusinesses);
    const lines = csv.split('\n');

    const header = lines[0];
    expect(header).toContain('Company');
    expect(header).toContain('LastName');
    expect(header).toContain('Email');
    expect(header).toContain('Phone');
    expect(header).toContain('Website');
    expect(header).toContain('Street');
    expect(header).toContain('City');
    expect(header).toContain('State');
    expect(header).toContain('PostalCode');
    expect(header).toContain('Industry');
    expect(header).toContain('NumberOfEmployees');
    expect(header).toContain('Rating');
    expect(header).toContain('LeadSource');
  });

  it('should use placeholder for required LastName field', () => {
    const csv = generateSalesforceCsv(mockBusinesses);

    // LastName is required in Salesforce, should have placeholder
    expect(csv).toContain('Owner');
  });

  it('should set rating based on email confidence', () => {
    const csv = generateSalesforceCsv(mockBusinesses);

    // High confidence = Hot, Medium = Warm, No email = Cold
    expect(csv).toContain('Hot');
    expect(csv).toContain('Cold');
    expect(csv).toContain('Warm');
  });

  it('should include LeadSource with source info', () => {
    const csv = generateSalesforceCsv(mockBusinesses);

    expect(csv).toContain('LeadGenTool - Google Maps');
    expect(csv).toContain('LeadGenTool - Yelp');
  });

  it('should include description with reviews and rating', () => {
    const csv = generateSalesforceCsv(mockBusinesses);

    expect(csv).toContain('Reviews: 100');
    expect(csv).toContain('Rating: 4.5');
  });
});

describe('Pipedrive CSV Export', () => {
  it('should generate valid Pipedrive CSV with correct headers', () => {
    const csv = generatePipedriveCsv(mockBusinesses);
    const lines = csv.split('\n');

    const header = lines[0];
    expect(header).toContain('Organization - Name');
    expect(header).toContain('Organization - Address');
    expect(header).toContain('Organization - Phone');
    expect(header).toContain('Person - Name');
    expect(header).toContain('Person - Email');
    expect(header).toContain('Deal - Title');
    expect(header).toContain('Note');
    expect(header).toContain('Label');
  });

  it('should generate deal title from business name', () => {
    const csv = generatePipedriveCsv(mockBusinesses);

    expect(csv).toContain('Test Business 1 - Outreach');
    expect(csv).toContain('Test Business 2 - Outreach');
  });

  it('should include note with source and rating info', () => {
    const csv = generatePipedriveCsv(mockBusinesses);

    expect(csv).toContain('Source: Google Maps');
    expect(csv).toContain('Rating: 4.5');
    expect(csv).toContain('100 reviews');
  });

  it('should set label based on email confidence', () => {
    const csv = generatePipedriveCsv(mockBusinesses);

    expect(csv).toContain('Hot Lead');
    expect(csv).toContain('Cold Lead');
    expect(csv).toContain('Warm Lead');
  });
});

describe('Mailchimp CSV Export', () => {
  it('should generate valid Mailchimp CSV with correct headers', () => {
    const csv = generateMailchimpCsv(mockBusinesses);
    const lines = csv.split('\n');

    const header = lines[0];
    expect(header).toContain('Email Address');
    expect(header).toContain('First Name');
    expect(header).toContain('Last Name');
    expect(header).toContain('Company');
    expect(header).toContain('Tags');
  });

  it('should only include businesses with emails', () => {
    const csv = generateMailchimpCsv(mockBusinesses);
    const lines = csv.split('\n');

    // Header + 2 businesses with email (not Business 2 which has no email)
    expect(lines.length).toBe(3);
    expect(csv).toContain('contact@test1.com');
    expect(csv).toContain('info@test3.com');
    expect(csv).not.toContain('Test Business 2');
  });

  it('should generate tags automatically', () => {
    const csv = generateMailchimpCsv(mockBusinesses);

    // Business 1: verified email, has industry, is B2C
    expect(csv).toContain('Verified Email');
    expect(csv).toContain('Restaurant & Food');
    expect(csv).toContain('B2C');
    expect(csv).toContain('Google Maps');
  });

  it('should include custom tags when provided', () => {
    const csv = generateMailchimpCsv(mockBusinesses, { tags: ['Campaign2024', 'Priority'] });

    expect(csv).toContain('Campaign2024');
    expect(csv).toContain('Priority');
  });
});

describe('CRM Export via Unified Function', () => {
  it('should export HubSpot format', async () => {
    const result = await exportBusinesses(mockBusinesses, 'hubspot', 'test');

    expect(result.mimeType).toBe('text/csv');
    expect(result.filename).toContain('hubspot_import');
    expect(result.filename).toContain('.csv');
  });

  it('should export Salesforce format', async () => {
    const result = await exportBusinesses(mockBusinesses, 'salesforce', 'test');

    expect(result.mimeType).toBe('text/csv');
    expect(result.filename).toContain('salesforce_leads');
    expect(result.filename).toContain('.csv');
  });

  it('should export Pipedrive format', async () => {
    const result = await exportBusinesses(mockBusinesses, 'pipedrive', 'test');

    expect(result.mimeType).toBe('text/csv');
    expect(result.filename).toContain('pipedrive_import');
    expect(result.filename).toContain('.csv');
  });

  it('should export Mailchimp format', async () => {
    const result = await exportBusinesses(mockBusinesses, 'mailchimp', 'test');

    expect(result.mimeType).toBe('text/csv');
    expect(result.filename).toContain('mailchimp_audience');
    expect(result.filename).toContain('.csv');
  });
});

describe('CRM Formats in getAvailableFormats', () => {
  it('should include all CRM formats', () => {
    const formats = getAvailableFormats();
    const values = formats.map(f => f.value);

    expect(values).toContain('hubspot');
    expect(values).toContain('salesforce');
    expect(values).toContain('pipedrive');
    expect(values).toContain('mailchimp');
  });

  it('should have 8 formats total (4 standard + 4 CRM)', () => {
    const formats = getAvailableFormats();
    expect(formats.length).toBe(8);
  });

  it('should categorize formats correctly', () => {
    const formats = getAvailableFormats();

    const standardFormats = formats.filter(f => f.category === 'standard');
    const crmFormats = formats.filter(f => f.category === 'crm');

    expect(standardFormats.length).toBe(4);
    expect(crmFormats.length).toBe(4);
  });
});

describe('CRM Field Mappings Documentation', () => {
  it('should have documentation for all CRM formats', () => {
    expect(CRM_FIELD_MAPPINGS).toHaveProperty('hubspot');
    expect(CRM_FIELD_MAPPINGS).toHaveProperty('salesforce');
    expect(CRM_FIELD_MAPPINGS).toHaveProperty('pipedrive');
    expect(CRM_FIELD_MAPPINGS).toHaveProperty('mailchimp');
  });

  it('should have required fields documented', () => {
    expect(CRM_FIELD_MAPPINGS.hubspot.requiredFields).toContain('Email');
    expect(CRM_FIELD_MAPPINGS.salesforce.requiredFields).toContain('Company');
    expect(CRM_FIELD_MAPPINGS.salesforce.requiredFields).toContain('LastName');
    expect(CRM_FIELD_MAPPINGS.pipedrive.requiredFields).toContain('Organization - Name');
    expect(CRM_FIELD_MAPPINGS.mailchimp.requiredFields).toContain('Email Address');
  });

  it('should have field mappings and notes', () => {
    for (const crm of Object.values(CRM_FIELD_MAPPINGS)) {
      expect(crm.fieldMap).toBeDefined();
      expect(crm.notes).toBeDefined();
      expect(crm.notes.length).toBeGreaterThan(0);
    }
  });
});
