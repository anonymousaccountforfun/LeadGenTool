/**
 * Multi-Format Export Module
 *
 * Supports: Excel, CSV, JSON, Clipboard (TSV)
 */

import ExcelJS from 'exceljs';
import { Business } from './db';

// Export format types
export type ExportFormat = 'excel' | 'csv' | 'json' | 'tsv' | 'hubspot' | 'salesforce' | 'pipedrive' | 'mailchimp';

// Export options
export interface ExportOptions {
  format: ExportFormat;
  includeHeaders?: boolean;
  selectedIds?: number[]; // Export only selected rows
  columns?: string[]; // Specific columns to include
}

// Column definitions for export
export const EXPORT_COLUMNS = {
  name: 'Name',
  website: 'Website',
  email: 'Email',
  email_status: 'Email Status',
  email_confidence: 'Email Confidence',
  phone: 'Phone',
  address: 'Address',
  instagram: 'Instagram',
  rating: 'Rating',
  review_count: 'Reviews',
  years_in_business: 'Years in Business',
  employee_count: 'Employee Count',
  company_size: 'Company Size',
  industry: 'Industry',
  business_type: 'Business Type',
  source: 'Data Source',
} as const;

export type ExportColumn = keyof typeof EXPORT_COLUMNS;

// Default columns for export
const DEFAULT_COLUMNS: ExportColumn[] = [
  'name', 'website', 'email', 'email_status', 'phone', 'address',
  'rating', 'review_count', 'source'
];

// All columns for full export
const ALL_COLUMNS: ExportColumn[] = Object.keys(EXPORT_COLUMNS) as ExportColumn[];

// ============ Helper Functions ============

function getEmailStatus(email: string | null, confidence: number) {
  if (!email) return { text: 'None', color: 'A0A0A0' };
  if (confidence >= 0.8) return { text: 'Verified', color: '22C55E' };
  if (confidence >= 0.5) return { text: 'Likely', color: 'EAB308' };
  return { text: 'Check', color: 'F97316' };
}

function getBusinessTypeLabel(isB2B: boolean | null | undefined): string {
  if (isB2B === null || isB2B === undefined) return 'Unknown';
  return isB2B ? 'B2B' : 'B2C';
}

function getEmployeeSizeRange(count: number | null | undefined): string {
  if (!count) return 'Unknown';
  if (count <= 10) return '1-10';
  if (count <= 50) return '11-50';
  if (count <= 200) return '51-200';
  if (count <= 500) return '201-500';
  return '500+';
}

function formatSourceName(source: string): string {
  const sourceNames: Record<string, string> = {
    'google_maps': 'Google Maps',
    'google_search': 'Google Search',
    'google_places_api': 'Google Places API',
    'google_serp': 'Google SERP',
    'yelp': 'Yelp',
    'yelp_fusion_api': 'Yelp API',
    'foursquare_api': 'Foursquare',
    'here_api': 'HERE',
    'tomtom_api': 'TomTom',
    'yellow_pages': 'Yellow Pages',
    'bbb': 'BBB',
    'manta': 'Manta',
    'healthgrades': 'Healthgrades',
    'zocdoc': 'Zocdoc',
    'angi': 'Angi',
    'homeadvisor': 'HomeAdvisor',
    'thumbtack': 'Thumbtack',
    'tripadvisor': 'TripAdvisor',
    'instagram': 'Instagram',
  };
  return sourceNames[source] || source;
}

function getIndustryLabel(code: string | null | undefined): string {
  if (!code) return '';
  const industries: Record<string, string> = {
    'restaurant_food': 'Restaurant & Food',
    'beauty_wellness': 'Beauty & Wellness',
    'retail': 'Retail',
    'home_services': 'Home Services',
    'medical': 'Medical & Healthcare',
    'automotive': 'Automotive',
    'professional_services': 'Professional Services',
    'entertainment': 'Entertainment',
    'education': 'Education',
    'pet_services': 'Pet Services',
  };
  return industries[code] || code;
}

/**
 * Get formatted value for a column
 */
function getColumnValue(business: Business, column: ExportColumn): string {
  switch (column) {
    case 'name':
      return business.name;
    case 'website':
      return business.website || '';
    case 'email':
      return business.email || '';
    case 'email_status':
      return getEmailStatus(business.email, business.email_confidence).text;
    case 'email_confidence':
      return business.email ? `${Math.round(business.email_confidence * 100)}%` : '';
    case 'phone':
      return business.phone || '';
    case 'address':
      return business.address || '';
    case 'instagram':
      return business.instagram || '';
    case 'rating':
      return business.rating?.toFixed(1) || '';
    case 'review_count':
      return business.review_count?.toString() || '';
    case 'years_in_business':
      return business.years_in_business?.toString() || '';
    case 'employee_count':
      return business.employee_count?.toString() || '';
    case 'company_size':
      return getEmployeeSizeRange(business.employee_count);
    case 'industry':
      return getIndustryLabel(business.industry_code);
    case 'business_type':
      return getBusinessTypeLabel(business.is_b2b);
    case 'source':
      return formatSourceName(business.source);
    default:
      return '';
  }
}

/**
 * Filter businesses by selected IDs
 */
function filterBusinesses(businesses: Business[], selectedIds?: number[]): Business[] {
  if (!selectedIds || selectedIds.length === 0) return businesses;
  const idSet = new Set(selectedIds);
  return businesses.filter(b => idSet.has(b.id));
}

// ============ CSV Export ============

/**
 * Escape CSV field value
 */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Generate CSV export
 */
export function generateCsv(
  businesses: Business[],
  options: { columns?: ExportColumn[]; selectedIds?: number[]; includeHeaders?: boolean } = {}
): string {
  const {
    columns = DEFAULT_COLUMNS,
    selectedIds,
    includeHeaders = true,
  } = options;

  const filtered = filterBusinesses(businesses, selectedIds);
  const lines: string[] = [];

  // Add header row
  if (includeHeaders) {
    const headers = columns.map(col => EXPORT_COLUMNS[col]);
    lines.push(headers.map(escapeCsvField).join(','));
  }

  // Add data rows
  for (const business of filtered) {
    const values = columns.map(col => getColumnValue(business, col));
    lines.push(values.map(escapeCsvField).join(','));
  }

  return lines.join('\n');
}

// ============ TSV Export (Clipboard) ============

/**
 * Generate TSV for clipboard (paste into spreadsheets)
 */
export function generateTsv(
  businesses: Business[],
  options: { columns?: ExportColumn[]; selectedIds?: number[]; includeHeaders?: boolean } = {}
): string {
  const {
    columns = DEFAULT_COLUMNS,
    selectedIds,
    includeHeaders = true,
  } = options;

  const filtered = filterBusinesses(businesses, selectedIds);
  const lines: string[] = [];

  // Add header row
  if (includeHeaders) {
    const headers = columns.map(col => EXPORT_COLUMNS[col]);
    lines.push(headers.join('\t'));
  }

  // Add data rows
  for (const business of filtered) {
    const values = columns.map(col => {
      // Replace tabs and newlines in values
      return getColumnValue(business, col).replace(/[\t\n\r]/g, ' ');
    });
    lines.push(values.join('\t'));
  }

  return lines.join('\n');
}

// ============ JSON Export ============

export interface JsonExportBusiness {
  id: number;
  name: string;
  website: string | null;
  email: string | null;
  emailConfidence: number;
  emailStatus: string;
  phone: string | null;
  address: string | null;
  instagram: string | null;
  rating: number | null;
  reviewCount: number | null;
  yearsInBusiness: number | null;
  employeeCount: number | null;
  companySize: string;
  industry: string;
  businessType: string;
  source: string;
}

export interface JsonExport {
  exportedAt: string;
  totalCount: number;
  businesses: JsonExportBusiness[];
  summary: {
    withEmail: number;
    verifiedEmail: number;
    b2cCount: number;
    sourceBreakdown: Record<string, number>;
  };
}

/**
 * Generate JSON export
 */
export function generateJson(
  businesses: Business[],
  options: { selectedIds?: number[] } = {}
): JsonExport {
  const { selectedIds } = options;
  const filtered = filterBusinesses(businesses, selectedIds);

  const exportedBusinesses: JsonExportBusiness[] = filtered.map(b => ({
    id: b.id,
    name: b.name,
    website: b.website,
    email: b.email,
    emailConfidence: b.email_confidence,
    emailStatus: getEmailStatus(b.email, b.email_confidence).text,
    phone: b.phone,
    address: b.address,
    instagram: b.instagram,
    rating: b.rating,
    reviewCount: b.review_count,
    yearsInBusiness: b.years_in_business,
    employeeCount: b.employee_count,
    companySize: getEmployeeSizeRange(b.employee_count),
    industry: getIndustryLabel(b.industry_code),
    businessType: getBusinessTypeLabel(b.is_b2b),
    source: formatSourceName(b.source),
  }));

  // Calculate summary
  const withEmail = filtered.filter(b => b.email).length;
  const verifiedEmail = filtered.filter(b => b.email && b.email_confidence >= 0.8).length;
  const b2cCount = filtered.filter(b => b.is_b2b === false).length;

  const sourceBreakdown = filtered.reduce((acc, b) => {
    const src = formatSourceName(b.source);
    acc[src] = (acc[src] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    exportedAt: new Date().toISOString(),
    totalCount: filtered.length,
    businesses: exportedBusinesses,
    summary: {
      withEmail,
      verifiedEmail,
      b2cCount,
      sourceBreakdown,
    },
  };
}

// ============ CRM Export Formats ============

/**
 * HubSpot CSV Format
 * Columns: Email, First Name, Last Name, Company, Phone, Website, Address, City, State, Country
 * HubSpot requires Email as the primary identifier
 */
export function generateHubSpotCsv(
  businesses: Business[],
  options: { selectedIds?: number[] } = {}
): string {
  const { selectedIds } = options;
  const filtered = filterBusinesses(businesses, selectedIds);

  // HubSpot standard column headers
  const headers = [
    'Email',
    'First Name',
    'Last Name',
    'Company',
    'Phone Number',
    'Website URL',
    'Street Address',
    'City',
    'State/Region',
    'Country/Region',
    'Industry',
    'Number of Employees',
    'Lead Source',
    'Lead Status',
  ];

  const lines: string[] = [headers.map(escapeCsvField).join(',')];

  for (const business of filtered) {
    const address = parseAddress(business.address);
    const emailStatus = business.email && business.email_confidence >= 0.8 ? 'Verified' :
                        business.email && business.email_confidence >= 0.5 ? 'Unverified' : 'No Email';

    const row = [
      business.email || '',
      '', // First Name - typically not available from business data
      '', // Last Name - typically not available
      business.name,
      business.phone || '',
      business.website || '',
      address.street,
      address.city,
      address.state,
      'United States', // Assuming US-focused tool
      getIndustryLabel(business.industry_code),
      business.employee_count?.toString() || '',
      formatSourceName(business.source),
      emailStatus,
    ];

    lines.push(row.map(escapeCsvField).join(','));
  }

  return lines.join('\n');
}

/**
 * Salesforce Lead Import Format
 * Standard Salesforce Lead object fields
 */
export function generateSalesforceCsv(
  businesses: Business[],
  options: { selectedIds?: number[] } = {}
): string {
  const { selectedIds } = options;
  const filtered = filterBusinesses(businesses, selectedIds);

  // Salesforce Lead object standard fields
  const headers = [
    'Company',
    'LastName',
    'FirstName',
    'Title',
    'Email',
    'Phone',
    'Website',
    'Street',
    'City',
    'State',
    'PostalCode',
    'Country',
    'Industry',
    'NumberOfEmployees',
    'Rating',
    'LeadSource',
    'Description',
  ];

  const lines: string[] = [headers.map(escapeCsvField).join(',')];

  for (const business of filtered) {
    const address = parseAddress(business.address);
    const rating = business.email && business.email_confidence >= 0.8 ? 'Hot' :
                   business.email && business.email_confidence >= 0.5 ? 'Warm' : 'Cold';

    const row = [
      business.name,
      'Owner', // Placeholder - LastName is required in Salesforce
      '', // FirstName
      '', // Title
      business.email || '',
      business.phone || '',
      business.website || '',
      address.street,
      address.city,
      address.state,
      address.zip,
      'United States',
      getIndustryLabel(business.industry_code),
      business.employee_count?.toString() || '',
      rating,
      `LeadGenTool - ${formatSourceName(business.source)}`,
      `Reviews: ${business.review_count || 0}, Rating: ${business.rating?.toFixed(1) || 'N/A'}`,
    ];

    lines.push(row.map(escapeCsvField).join(','));
  }

  return lines.join('\n');
}

/**
 * Pipedrive Import Format
 * Pipedrive uses Organizations and Persons
 */
export function generatePipedriveCsv(
  businesses: Business[],
  options: { selectedIds?: number[] } = {}
): string {
  const { selectedIds } = options;
  const filtered = filterBusinesses(businesses, selectedIds);

  // Pipedrive organization fields
  const headers = [
    'Organization - Name',
    'Organization - Address',
    'Organization - Phone',
    'Person - Name',
    'Person - Email',
    'Person - Phone',
    'Deal - Title',
    'Deal - Value',
    'Note',
    'Label',
  ];

  const lines: string[] = [headers.map(escapeCsvField).join(',')];

  for (const business of filtered) {
    const label = business.email && business.email_confidence >= 0.8 ? 'Hot Lead' :
                  business.email && business.email_confidence >= 0.5 ? 'Warm Lead' : 'Cold Lead';

    const row = [
      business.name,
      business.address || '',
      business.phone || '',
      '', // Person name - not available
      business.email || '',
      business.phone || '',
      `${business.name} - Outreach`,
      '', // Deal value - not available
      `Source: ${formatSourceName(business.source)}. Rating: ${business.rating?.toFixed(1) || 'N/A'} (${business.review_count || 0} reviews). Website: ${business.website || 'N/A'}`,
      label,
    ];

    lines.push(row.map(escapeCsvField).join(','));
  }

  return lines.join('\n');
}

/**
 * Mailchimp Audience Import Format
 * Standard Mailchimp audience CSV format
 */
export function generateMailchimpCsv(
  businesses: Business[],
  options: { selectedIds?: number[]; tags?: string[] } = {}
): string {
  const { selectedIds, tags = [] } = options;
  const filtered = filterBusinesses(businesses, selectedIds);

  // Mailchimp audience fields
  const headers = [
    'Email Address',
    'First Name',
    'Last Name',
    'Address',
    'Phone',
    'Company',
    'Tags',
  ];

  const lines: string[] = [headers.map(escapeCsvField).join(',')];

  // Only include businesses with emails for Mailchimp
  const withEmail = filtered.filter(b => b.email);

  for (const business of withEmail) {
    // Generate tags based on business data
    const businessTags = [...tags];
    if (business.email_confidence >= 0.8) businessTags.push('Verified Email');
    if (business.industry_code) businessTags.push(getIndustryLabel(business.industry_code));
    if (business.is_b2b === false) businessTags.push('B2C');
    businessTags.push(formatSourceName(business.source));

    const row = [
      business.email || '',
      '', // First Name
      '', // Last Name
      business.address || '',
      business.phone || '',
      business.name,
      businessTags.join(', '),
    ];

    lines.push(row.map(escapeCsvField).join(','));
  }

  return lines.join('\n');
}

/**
 * Parse address into components
 */
function parseAddress(address: string | null): {
  street: string;
  city: string;
  state: string;
  zip: string;
} {
  if (!address) {
    return { street: '', city: '', state: '', zip: '' };
  }

  // Common US address format: "123 Main St, City, ST 12345"
  const parts = address.split(',').map(p => p.trim());

  if (parts.length >= 3) {
    const street = parts[0];
    const city = parts[1];
    // Last part often contains "State ZIP"
    const stateZipMatch = parts[2].match(/([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/);
    if (stateZipMatch) {
      return {
        street,
        city,
        state: stateZipMatch[1] || '',
        zip: stateZipMatch[2] || '',
      };
    }
    return { street, city, state: parts[2], zip: '' };
  } else if (parts.length === 2) {
    return { street: parts[0], city: parts[1], state: '', zip: '' };
  }

  return { street: address, city: '', state: '', zip: '' };
}

// ============ Excel Export ============

/**
 * Generate Excel export (existing functionality)
 */
export async function generateExcel(
  businesses: Business[],
  query: string,
  options: { selectedIds?: number[] } = {}
): Promise<Buffer> {
  const { selectedIds } = options;
  const filtered = filterBusinesses(businesses, selectedIds);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LeadGenTool';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Leads', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // Define columns with new B2C targeting fields
  worksheet.columns = [
    { header: 'Name', key: 'name', width: 35 },
    { header: 'Website', key: 'website', width: 40 },
    { header: 'Email', key: 'email', width: 35 },
    { header: 'Email Status', key: 'status', width: 12 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'Address', key: 'address', width: 45 },
    { header: 'Instagram', key: 'instagram', width: 20 },
    { header: 'Rating', key: 'rating', width: 8 },
    { header: 'Reviews', key: 'reviews', width: 10 },
    { header: 'Years in Business', key: 'years_in_business', width: 16 },
    { header: 'Employee Count', key: 'employee_count', width: 14 },
    { header: 'Company Size', key: 'company_size', width: 12 },
    { header: 'Industry', key: 'industry', width: 20 },
    { header: 'Business Type', key: 'business_type', width: 12 },
    { header: 'Data Source', key: 'source', width: 18 },
  ];

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  // Add data rows
  for (const business of filtered) {
    const status = getEmailStatus(business.email, business.email_confidence);

    const row = worksheet.addRow({
      name: business.name,
      website: business.website || '',
      email: business.email || '',
      status: status.text,
      phone: business.phone || '',
      address: business.address || '',
      instagram: business.instagram || '',
      rating: business.rating?.toFixed(1) || '',
      reviews: business.review_count || '',
      years_in_business: business.years_in_business || '',
      employee_count: business.employee_count || '',
      company_size: getEmployeeSizeRange(business.employee_count),
      industry: getIndustryLabel(business.industry_code),
      business_type: getBusinessTypeLabel(business.is_b2b),
      source: formatSourceName(business.source),
    });

    // Style email status cell
    const statusCell = row.getCell('status');
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${status.color}` } };
    statusCell.font = { bold: true, color: { argb: status.color === 'A0A0A0' ? 'FF333333' : 'FFFFFFFF' } };
    statusCell.alignment = { horizontal: 'center' };

    // Style business type cell
    const businessTypeCell = row.getCell('business_type');
    const btValue = businessTypeCell.value?.toString();
    if (btValue === 'B2C') {
      businessTypeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF22C55E' } };
      businessTypeCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    } else if (btValue === 'B2B') {
      businessTypeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
      businessTypeCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    } else {
      businessTypeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA0A0A0' } };
      businessTypeCell.font = { color: { argb: 'FF333333' } };
    }
    businessTypeCell.alignment = { horizontal: 'center' };

    // Add hyperlinks
    if (business.website) {
      row.getCell('website').value = { text: business.website, hyperlink: business.website };
      row.getCell('website').font = { color: { argb: 'FF0066CC' }, underline: true };
    }
    if (business.email) {
      row.getCell('email').value = { text: business.email, hyperlink: `mailto:${business.email}` };
      row.getCell('email').font = { color: { argb: 'FF0066CC' }, underline: true };
    }
  }

  // Add summary sheet
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 25 },
    { header: 'Value', key: 'value', width: 20 },
  ];

  const summaryHeader = summarySheet.getRow(1);
  summaryHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summaryHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };

  // Calculate summary stats
  const totalLeads = filtered.length;
  const withEmail = filtered.filter(b => b.email).length;
  const verifiedEmail = filtered.filter(b => b.email && b.email_confidence >= 0.8).length;
  const b2cCount = filtered.filter(b => b.is_b2b === false).length;
  const withEmployeeCount = filtered.filter(b => b.employee_count).length;

  const sourceCounts = filtered.reduce((acc, b) => {
    const src = formatSourceName(b.source);
    acc[src] = (acc[src] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  summarySheet.addRow({ metric: 'Search Query', value: query });
  summarySheet.addRow({ metric: 'Total Leads', value: totalLeads });
  summarySheet.addRow({ metric: 'With Email', value: withEmail });
  summarySheet.addRow({ metric: 'Verified Emails', value: verifiedEmail });
  summarySheet.addRow({ metric: 'B2C Businesses', value: b2cCount });
  summarySheet.addRow({ metric: 'With Employee Data', value: withEmployeeCount });
  summarySheet.addRow({ metric: '', value: '' });
  summarySheet.addRow({ metric: 'Data Sources', value: '' });

  for (const [source, count] of Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])) {
    summarySheet.addRow({ metric: `  ${source}`, value: count });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ============ Unified Export Function ============

export interface ExportResult {
  data: string | Buffer;
  mimeType: string;
  filename: string;
}

/**
 * Export businesses in the specified format
 */
export async function exportBusinesses(
  businesses: Business[],
  format: ExportFormat,
  query: string,
  options: { selectedIds?: number[]; columns?: ExportColumn[] } = {}
): Promise<ExportResult> {
  const timestamp = new Date().toISOString().split('T')[0];
  const sanitizedQuery = query.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);

  switch (format) {
    case 'csv': {
      const csv = generateCsv(businesses, options);
      return {
        data: csv,
        mimeType: 'text/csv',
        filename: `leads_${sanitizedQuery}_${timestamp}.csv`,
      };
    }

    case 'tsv': {
      const tsv = generateTsv(businesses, options);
      return {
        data: tsv,
        mimeType: 'text/tab-separated-values',
        filename: `leads_${sanitizedQuery}_${timestamp}.tsv`,
      };
    }

    case 'json': {
      const json = generateJson(businesses, options);
      return {
        data: JSON.stringify(json, null, 2),
        mimeType: 'application/json',
        filename: `leads_${sanitizedQuery}_${timestamp}.json`,
      };
    }

    case 'hubspot': {
      const csv = generateHubSpotCsv(businesses, options);
      return {
        data: csv,
        mimeType: 'text/csv',
        filename: `hubspot_import_${sanitizedQuery}_${timestamp}.csv`,
      };
    }

    case 'salesforce': {
      const csv = generateSalesforceCsv(businesses, options);
      return {
        data: csv,
        mimeType: 'text/csv',
        filename: `salesforce_leads_${sanitizedQuery}_${timestamp}.csv`,
      };
    }

    case 'pipedrive': {
      const csv = generatePipedriveCsv(businesses, options);
      return {
        data: csv,
        mimeType: 'text/csv',
        filename: `pipedrive_import_${sanitizedQuery}_${timestamp}.csv`,
      };
    }

    case 'mailchimp': {
      const csv = generateMailchimpCsv(businesses, options);
      return {
        data: csv,
        mimeType: 'text/csv',
        filename: `mailchimp_audience_${sanitizedQuery}_${timestamp}.csv`,
      };
    }

    case 'excel':
    default: {
      const excel = await generateExcel(businesses, query, options);
      return {
        data: excel,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `leads_${sanitizedQuery}_${timestamp}.xlsx`,
      };
    }
  }
}

/**
 * Get available export formats
 */
export function getAvailableFormats(): { value: ExportFormat; label: string; description: string; category?: string }[] {
  return [
    // Standard formats
    { value: 'excel', label: 'Excel (.xlsx)', description: 'Full formatting with colors and hyperlinks', category: 'standard' },
    { value: 'csv', label: 'CSV', description: 'Universal format for any spreadsheet', category: 'standard' },
    { value: 'json', label: 'JSON', description: 'For developers and data pipelines', category: 'standard' },
    { value: 'tsv', label: 'Clipboard', description: 'Copy to clipboard, paste into sheets', category: 'standard' },
    // CRM formats
    { value: 'hubspot', label: 'HubSpot', description: 'Import directly into HubSpot CRM', category: 'crm' },
    { value: 'salesforce', label: 'Salesforce', description: 'Salesforce Lead object format', category: 'crm' },
    { value: 'pipedrive', label: 'Pipedrive', description: 'Pipedrive organizations & deals', category: 'crm' },
    { value: 'mailchimp', label: 'Mailchimp', description: 'Email audience import format', category: 'crm' },
  ];
}

/**
 * CRM Field Mapping Documentation
 * Provides detailed field mappings for each CRM format
 */
export const CRM_FIELD_MAPPINGS = {
  hubspot: {
    name: 'HubSpot',
    requiredFields: ['Email'],
    fieldMap: {
      'Email': 'business.email',
      'Company': 'business.name',
      'Phone Number': 'business.phone',
      'Website URL': 'business.website',
      'Street Address': 'parsed from address',
      'City': 'parsed from address',
      'State/Region': 'parsed from address',
      'Industry': 'business.industry_code',
      'Number of Employees': 'business.employee_count',
      'Lead Source': 'business.source',
      'Lead Status': 'derived from email_confidence',
    },
    notes: [
      'Email is the primary identifier in HubSpot',
      'First/Last Name fields are left empty as business data typically lacks owner names',
      'Lead Status is set based on email verification confidence',
    ],
  },
  salesforce: {
    name: 'Salesforce',
    requiredFields: ['Company', 'LastName'],
    fieldMap: {
      'Company': 'business.name',
      'LastName': '"Owner" placeholder (required field)',
      'Email': 'business.email',
      'Phone': 'business.phone',
      'Website': 'business.website',
      'Street': 'parsed from address',
      'City': 'parsed from address',
      'State': 'parsed from address',
      'PostalCode': 'parsed from address',
      'Industry': 'business.industry_code',
      'NumberOfEmployees': 'business.employee_count',
      'Rating': 'Hot/Warm/Cold based on email confidence',
      'LeadSource': 'LeadGenTool + source',
      'Description': 'reviews and rating info',
    },
    notes: [
      'LastName is required - uses "Owner" as placeholder',
      'Rating field maps to Salesforce picklist: Hot (verified email), Warm (unverified), Cold (no email)',
      'Description includes review count and rating for context',
    ],
  },
  pipedrive: {
    name: 'Pipedrive',
    requiredFields: ['Organization - Name'],
    fieldMap: {
      'Organization - Name': 'business.name',
      'Organization - Address': 'business.address',
      'Organization - Phone': 'business.phone',
      'Person - Email': 'business.email',
      'Person - Phone': 'business.phone',
      'Deal - Title': 'business.name + " - Outreach"',
      'Note': 'source, rating, reviews, website',
      'Label': 'Hot/Warm/Cold Lead based on email confidence',
    },
    notes: [
      'Creates Organization records with linked Person (email contact)',
      'Deal Title is auto-generated for easy pipeline creation',
      'Label helps prioritize outreach in Pipedrive',
    ],
  },
  mailchimp: {
    name: 'Mailchimp',
    requiredFields: ['Email Address'],
    fieldMap: {
      'Email Address': 'business.email (required)',
      'Company': 'business.name',
      'Address': 'business.address',
      'Phone': 'business.phone',
      'Tags': 'auto-generated from industry, source, email status',
    },
    notes: [
      'Only businesses WITH email are exported (Mailchimp requires email)',
      'Tags are auto-generated for easy segmentation',
      'Tags include: Verified Email (if applicable), Industry, B2C (if applicable), Source',
    ],
  },
} as const;
